import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from config import Config
from governance.frameworks import get_governance_context
from models.schemas import (
    EvalJob,
    EvalStatus,
    EvaluationInput,
    StepStatus,
    CouncilResult,
)
from orchestrators.simple_orchestrator import SimpleOrchestrator
from orchestrators.orchestrator_factory import OrchestratorFactory
from experts.expert import Expert
from experts.llm_providers import ProviderRegistry
from dimensions.loader import load_all_dimensions

logger = logging.getLogger(__name__)

# Step definitions — must match SimpleOrchestrator step indices
EVAL_STEPS = [
    "Retrieving governance context",
    "Expert A (Claude) evaluating",
    "Expert B (GPT-4o) evaluating",
    "Expert C (Gemini) evaluating",
    "Cross-critique round",
    "Experts revising scores",
    "Council debate & synthesis",
    "Generating final verdict",
]


class EvaluationService:
    """
    Manages async evaluation jobs.

    Uses an in-memory dict for PoC — no Redis/DB needed.
    NOTE: For production, replace with Redis + Celery or a proper job queue.
    The in-memory store will lose jobs on server restart. This is acceptable
    for a PoC/demo where evaluations are short-lived and the frontend is
    expected to consume results promptly.

    Thread safety: Python's GIL prevents dict corruption from concurrent reads/writes.
    For production scale, add explicit locking (threading.Lock) around dict mutations.
    """

    def __init__(self):
        self.jobs: Dict[str, EvalJob] = {}
        self._lock = threading.Lock()

    def submit_evaluation(self, eval_input: EvaluationInput) -> str:
        """
        Create a new evaluation job, start it in a background thread, return eval_id.
        Returns immediately — the actual evaluation runs asynchronously.
        """
        eval_id = str(uuid.uuid4())[:8]

        # Build initial steps based on which experts are enabled
        enabled_experts = [e for e in eval_input.experts if e.enabled]
        steps = self._build_steps(enabled_experts, eval_input.input_method)

        job = EvalJob(
            eval_id=eval_id,
            status=EvalStatus.QUEUED,
            progress=0,
            current_step="Queued",
            steps=steps,
            result=None,
            error=None,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        with self._lock:
            self.jobs[eval_id] = job

        # Start background thread
        thread = threading.Thread(
            target=self._run_evaluation,
            args=(eval_id, eval_input),
            daemon=True,
            name=f"eval-{eval_id}",
        )
        thread.start()

        logger.info(f"[EvaluationService] Submitted evaluation {eval_id} in background thread")
        return eval_id

    def get_status(self, eval_id: str) -> Optional[EvalJob]:
        """Return the current job state for status polling."""
        return self.jobs.get(eval_id)

    def get_result(self, eval_id: str) -> Optional[dict]:
        """Return serialized result dict if evaluation is complete."""
        job = self.jobs.get(eval_id)
        if job and job.status == EvalStatus.COMPLETE and job.result:
            if isinstance(job.result, dict):
                return job.result
            return job.result.to_dict()
        return None

    def list_completed(self) -> list:
        """Return summary of all completed evaluations (from in-memory store)."""
        result = []
        for job in self.jobs.values():
            if job.status == EvalStatus.COMPLETE and job.result:
                r = job.result
                if isinstance(r, dict):
                    result.append({
                        "eval_id": r.get("eval_id", ""),
                        "agent_name": r.get("agent_name", ""),
                        "verdict": r.get("verdict", {}).get("final_verdict", "UNKNOWN"),
                        "confidence": r.get("verdict", {}).get("confidence", 0),
                        "timestamp": r.get("timestamp", ""),
                    })
                else:
                    result.append({
                        "eval_id": r.eval_id,
                        "agent_name": r.agent_name,
                        "verdict": r.final_verdict.value,
                        "confidence": r.confidence,
                        "timestamp": r.timestamp,
                    })
        return sorted(result, key=lambda x: x["timestamp"], reverse=True)

    def _build_steps(self, enabled_experts, input_method=None) -> list:
        """Build step list, prepending probe steps when input_method == 'api_probe'."""
        expert_step_names = {
            "claude": "Expert A (Claude) evaluating",
            "gpt4o": "Expert B (GPT-4o) evaluating",
            "gemini": "Expert C (Gemini) evaluating",
        }
        fallback_names = [
            "Expert A evaluating",
            "Expert B evaluating",
            "Expert C evaluating",
        ]

        steps = []

        # Probe steps come first for api_probe mode
        if input_method == "api_probe":
            steps.append(StepStatus(step="Generating test prompts", status="pending"))
            steps.append(StepStatus(step="Probing target API", status="pending"))

        steps.append(StepStatus(step="Retrieving governance context", status="pending"))

        for i, expert_config in enumerate(enabled_experts[:3]):
            name = expert_step_names.get(expert_config.llm, fallback_names[i])
            steps.append(StepStatus(step=name, status="pending"))

        # Pad so governance + experts always totals 4 entries (before critique etc.)
        probe_offset = 2 if input_method == "api_probe" else 0
        while len(steps) < 4 + probe_offset:
            idx = len(steps) - 1 - probe_offset
            steps.append(StepStatus(
                step=f"Expert {['A', 'B', 'C'][idx]} evaluating",
                status="skipped",
            ))

        steps.append(StepStatus(step="Cross-critique round", status="pending"))
        steps.append(StepStatus(step="Experts revising scores", status="pending"))
        steps.append(StepStatus(step="Council debate & synthesis", status="pending"))
        steps.append(StepStatus(step="Generating final verdict", status="pending"))

        return steps

    def _run_evaluation(self, eval_id: str, eval_input: EvaluationInput):
        """
        The actual evaluation pipeline. Runs in background thread.
        Updates job status at each step so frontend can poll progress.
        For api_probe mode, two extra steps (generate prompts + probe API) run
        before the normal governance → experts → critique → synthesis → verdict pipeline.
        """
        job = self.jobs[eval_id]
        is_probe = eval_input.input_method == "api_probe"
        step_offset = 2 if is_probe else 0  # orchestrator step indices shift by 2 in probe mode

        try:
            job.status = EvalStatus.RUNNING

            # ── PROBE PHASE (api_probe mode only) ────────────────────────────
            if is_probe:
                api_config = eval_input.api_config or {}
                probe_count = max(1, int(api_config.get("probe_count", 20)))

                # Step 0: Generate test prompts with Claude
                self._update_step(job, 0, "running", "Generating test prompts with Claude...", 2)
                try:
                    from services.probe_service import ProbeService
                    probe = ProbeService(
                        anthropic_api_key=Config.ANTHROPIC_API_KEY,
                        model=Config.CLAUDE_MODEL,
                    )
                    test_prompts = probe.generate_test_prompts(eval_input.use_case, probe_count)
                    self._update_step(job, 0, "complete", f"Generated {len(test_prompts)} test prompts", 5)
                except Exception as e:
                    logger.error(f"[{eval_id}] Prompt generation failed: {e}")
                    self._update_step(job, 0, "failed", "Prompt generation failed", 5)
                    raise RuntimeError(f"Failed to generate test prompts: {e}")

                # Step 1: Probe the target API
                self._update_step(job, 1, "running", "Probing target API...", 5)

                def on_probe_progress(current, total):
                    if total > 0:
                        pct = 5 + round((current / total) * 10)  # 5 → 15 %
                        self._update_step(
                            job, 1, "running",
                            f"Probing target API ({current}/{total})...", pct,
                        )

                try:
                    conversations = probe.probe_target_api(
                        endpoint=api_config.get("endpoint", ""),
                        api_key=api_config.get("api_key", ""),
                        model=api_config.get("model", ""),
                        prompts=test_prompts,
                        on_progress=on_probe_progress,
                    )
                    if not conversations:
                        raise RuntimeError("No successful responses received from target API")
                    eval_input.conversations = conversations
                    self._update_step(job, 1, "complete", f"Collected {len(conversations)} responses", 15)
                except Exception as e:
                    logger.error(f"[{eval_id}] API probing failed: {e}")
                    self._update_step(job, 1, "failed", f"Probing failed: {e}", 15)
                    raise

            # ── GOVERNANCE CONTEXT ───────────────────────────────────────────
            gov_step = step_offset  # index 0 (normal) or 2 (probe)
            self._update_step(job, gov_step, "running", "Retrieving governance context",
                              15 if is_probe else 5)
            try:
                governance_context = get_governance_context(eval_input.frameworks)
            except Exception as e:
                logger.warning(f"[{eval_id}] Governance context failed: {e}, using empty")
                governance_context = "No governance context available."
            self._update_step(job, gov_step, "complete", "Governance context ready",
                              18 if is_probe else 10)

            # ── EXPERTS + ORCHESTRATOR ───────────────────────────────────────
            experts = self._create_experts(eval_input)
            if not experts:
                raise RuntimeError(
                    "No experts could be initialized. Check API key configuration."
                )

            # Select orchestration method from input (default: deliberative)
            strategy = getattr(eval_input, "orchestration_method", None) or "deliberative"
            try:
                orchestrator = OrchestratorFactory.create(strategy, experts)
                # Set extra params for deliberative orchestrator
                if hasattr(orchestrator, "synthesizer_expert"):
                    orchestrator.synthesizer_expert = experts[0]
                if hasattr(orchestrator, "eval_id"):
                    orchestrator.eval_id = eval_id
                if hasattr(orchestrator, "agent_name"):
                    orchestrator.agent_name = eval_input.agent_name
            except ValueError:
                logger.warning(f"Unknown strategy '{strategy}', falling back to deliberative")
                orchestrator = SimpleOrchestrator(
                    experts=experts,
                    synthesizer_expert=experts[0],
                    eval_id=eval_id,
                    agent_name=eval_input.agent_name,
                )

            # Offset orchestrator step indices so they map to the correct job.steps entries
            def on_progress(step_index: int, status: str, message: str, progress_pct: int):
                self._update_step_by_orchestrator_index(
                    job, step_index + step_offset, status, message, progress_pct
                )

            result: CouncilResult = orchestrator.run_evaluation(
                eval_input=eval_input,
                governance_context=governance_context,
                on_progress=on_progress,
            )

            # Normalize result — AggregateOrchestrator returns dict, SimpleOrchestrator returns CouncilResult
            if isinstance(result, dict):
                # Add eval_id if missing
                result["eval_id"] = result.get("eval_id", eval_id)
                job.result = result
            else:
                # CouncilResult object — save audit log
                try:
                    result.save_to_log(Config.LOG_DIR)
                    logger.info(f"[{eval_id}] Audit log saved to {Config.LOG_DIR}/{eval_id}.json")
                except Exception as e:
                    logger.warning(f"[{eval_id}] Failed to save audit log: {e}")
                job.result = result

            # Mark complete
            job.status = EvalStatus.COMPLETE
            job.progress = 100
            job.current_step = "Evaluation complete"

            verdict_str = result.get("verdict", {}).get("final_verdict", "?") if isinstance(result, dict) else result.final_verdict.value
            logger.info(f"[{eval_id}] Evaluation complete: verdict={verdict_str}")

        except Exception as e:
            logger.error(f"[{eval_id}] Evaluation failed: {e}", exc_info=True)
            job.status = EvalStatus.FAILED
            job.error = str(e)
            job.current_step = "Evaluation failed"

    def _create_experts(self, eval_input: EvaluationInput) -> list:
        """
        Instantiate expert objects using the ProviderRegistry.
        Supports any registered provider (claude, gpt4o, gemini, local, etc.).
        """
        registry = ProviderRegistry()
        dimensions = load_all_dimensions()
        experts = []
        expert_num = 0

        for expert_config in eval_input.experts:
            if not expert_config.enabled:
                continue

            llm = expert_config.llm.lower()
            expert_num += 1

            try:
                provider = registry.create(
                    provider_key=llm,
                    api_key=expert_config.custom_api_key or "",
                )
                expert_name = f"Expert {expert_num} ({provider.model})"
                experts.append(Expert(
                    name=expert_name,
                    provider=provider,
                    dimensions=dimensions,
                ))
                logger.info(f"Created expert: {expert_name} using {llm}")
            except Exception as e:
                logger.warning(f"Skipping {llm} expert: {e}")

        return experts

    def _update_step(
        self,
        job: EvalJob,
        step_index: int,
        status: str,
        current_step: str,
        progress: int,
    ):
        """Update a specific step in the job's steps list."""
        if 0 <= step_index < len(job.steps):
            job.steps[step_index].status = status
        job.current_step = current_step
        job.progress = progress

    def _update_step_by_orchestrator_index(
        self,
        job: EvalJob,
        orchestrator_step_index: int,
        status: str,
        message: str,
        progress_pct: int,
    ):
        """
        Map orchestrator step indices to job.steps array indices.

        Orchestrator step indices:
          0 = governance
          1 = expert A
          2 = expert B
          3 = expert C
          4 = critique
          5 = synthesis
          6 = verdict

        job.steps may have fewer entries if fewer experts are enabled,
        but we always have at least: [governance, expert(s)..., critique, synthesis, verdict]
        """
        # For the fixed 7-step mapping, use orchestrator index directly
        # since we pad the steps array to 7 entries in _build_steps
        self._update_step(job, orchestrator_step_index, status, message, progress_pct)
