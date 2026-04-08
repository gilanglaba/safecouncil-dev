"""
AggregateOrchestrator — Method A: Statistical Consensus.
Each expert evaluates independently, scores are averaged, verdict by majority vote.
No inter-agent communication. Fast and deterministic.
"""
import concurrent.futures
import logging
import time
from typing import List, Callable, Optional

from orchestrators.base_orchestrator import BaseOrchestrator
from models.schemas import (
    EvaluationInput,
    ExpertAssessment,
    DimensionScore,
    Finding,
    DebateMessage,
    Mitigation,
    Verdict,
    Severity,
)
from prompts.synthesis_prompt import build_aggregate_synthesis_prompt

logger = logging.getLogger(__name__)

# Step indices for progress tracking
STEP_GOVERNANCE = 0
# Expert steps are dynamic: STEP_GOVERNANCE + 1 + expert_index
STEP_AGGREGATE = -1  # Set dynamically


# ── SafeCouncil Aggregate Arbitration ────────────────────────────────────
# The aggregate orchestrator provides an alternative arbitration method where
# the final APPROVE/REVIEW/REJECT verdict is determined by majority vote
# across all independent expert assessments. Each expert evaluates the agent
# independently, and the council verdict reflects their collective judgment
# through statistical consensus rather than deliberative debate.


class AggregateOrchestrator(BaseOrchestrator):
    """
    Method A: Independent Scoring with Statistical Aggregation.
    - Each expert evaluates independently
    - Final scores = mean of expert scores
    - Final verdict = majority vote
    - Disagreements detected but NOT resolved through debate
    - A single LLM narrative synthesis call runs after the math. The
      synthesizer defaults to the expert set via `synthesizer_expert`
      (Claude-preferred, elected by EvaluationService), with fallback
      to the first council expert.
    """

    def __init__(self, experts, synthesizer_expert=None):
        super().__init__(experts)
        self.synthesizer_expert = synthesizer_expert

    def run_evaluation(self, eval_input: EvaluationInput, governance_context: str = "",
                       on_progress: Optional[Callable] = None) -> dict:
        start_time = time.time()
        total_api_calls = 0
        total_input_tokens = 0
        total_output_tokens = 0

        num_experts = len(self.experts)
        step_aggregate = STEP_GOVERNANCE + 1 + num_experts

        # ── Step 0: Governance context (already provided) ─────────────────
        self._fire_progress(on_progress, STEP_GOVERNANCE, "complete",
                            "Governance context loaded", 5)

        # ── Steps 1..N: Independent expert evaluations (PARALLEL) ─────────
        assessments: List[ExpertAssessment] = []

        # Mark all experts as running
        for i, expert in enumerate(self.experts):
            step_idx = STEP_GOVERNANCE + 1 + i
            progress_pct = 5 + int((i / num_experts) * 80)
            self._fire_progress(on_progress, step_idx, "running",
                                f"{expert.name} evaluating...", progress_pct)

        def _evaluate_expert(idx_expert):
            idx, expert = idx_expert
            return idx, expert, expert.evaluate(eval_input, governance_context)

        indexed_assessments = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_experts) as executor:
            futures = {
                executor.submit(_evaluate_expert, (i, expert)): i
                for i, expert in enumerate(self.experts)
            }
            for future in concurrent.futures.as_completed(futures):
                orig_idx = futures[future]
                step_idx = STEP_GOVERNANCE + 1 + orig_idx
                progress_pct = 5 + int(((orig_idx + 1) / num_experts) * 80)
                try:
                    idx, expert, assessment = future.result()
                    indexed_assessments.append((idx, assessment))
                    total_api_calls += expert.total_api_calls
                    total_input_tokens += expert.total_input_tokens
                    total_output_tokens += expert.total_output_tokens
                    self._fire_progress(on_progress, step_idx, "complete",
                                        f"{expert.name} complete", progress_pct)
                except Exception as e:
                    expert = self.experts[orig_idx]
                    logger.error(f"Expert {expert.name} failed: {e}")
                    self._fire_progress(on_progress, step_idx, "failed",
                                        f"{expert.name} failed: {str(e)[:100]}", progress_pct)

        # Sort by original index to maintain expert order
        indexed_assessments.sort(key=lambda x: x[0])
        assessments = [a for _, a in indexed_assessments]

        if not assessments:
            raise RuntimeError("All experts failed. Cannot produce evaluation.")

        # ── Final step: Aggregate scores + LLM narrative synthesis ────────
        self._fire_progress(on_progress, step_aggregate, "running",
                            "Aggregating expert scores...", 88)

        # Pick synthesizer for the narrative call.
        # Preference order: explicitly injected synthesizer_expert (Claude-preferred,
        # elected upstream by EvaluationService._select_synthesizer), else the first
        # council expert.
        synthesizer = self.synthesizer_expert or (self.experts[0] if self.experts else None)
        if synthesizer is not None:
            logger.info(
                f"[AggregateOrchestrator] Synthesizer: {synthesizer.name} "
                f"(provider={getattr(synthesizer, 'llm_provider', '?')})"
            )

        result = self._aggregate(
            assessments, eval_input, start_time,
            total_api_calls, total_input_tokens, total_output_tokens,
            synthesizer=synthesizer,
            on_progress=on_progress,
            step_aggregate=step_aggregate,
        )

        self._fire_progress(on_progress, step_aggregate, "complete",
                            "Aggregation complete", 100)

        return result

    def _aggregate(self, assessments: List[ExpertAssessment], eval_input: EvaluationInput,
                   start_time: float, api_calls: int, input_tokens: int, output_tokens: int,
                   synthesizer=None, on_progress: Optional[Callable] = None,
                   step_aggregate: int = -1) -> dict:
        """
        Aggregate expert assessments.

        Scores, verdict, confidence, and agreement_rate are computed by pure
        statistical methods (averaging, majority vote, variance). The narrative
        fields (executive_summary, debate_transcript, agreements, disagreements,
        mitigations) are generated by ONE LLM synthesis call when a synthesizer
        is provided — otherwise fall back to template-based defaults so the
        method never crashes.
        """

        # Average overall scores
        avg_score = round(sum(a.overall_score for a in assessments) / len(assessments))

        # Majority vote on verdict
        verdict_counts = {}
        for a in assessments:
            v = a.verdict.value if hasattr(a.verdict, "value") else str(a.verdict)
            verdict_counts[v] = verdict_counts.get(v, 0) + 1
        final_verdict = max(verdict_counts, key=verdict_counts.get)

        # Agreement rate: % of experts that agree with majority verdict
        max_votes = max(verdict_counts.values())
        agreement_rate = round((max_votes / len(assessments)) * 100)

        # Confidence based on score variance
        scores = [a.overall_score for a in assessments]
        variance = sum((s - avg_score) ** 2 for s in scores) / len(scores)
        # Lower variance = higher confidence. Map 0 variance → 95%, high variance → 50%
        confidence = max(50, min(95, round(95 - (variance / 10))))

        # Aggregate dimension scores (average across experts)
        dim_scores_map = {}
        for a in assessments:
            for ds in a.dimension_scores:
                key = (ds.dimension, ds.category)
                if key not in dim_scores_map:
                    dim_scores_map[key] = []
                dim_scores_map[key].append(ds.score)

        aggregated_dim_scores = []
        for (dim, cat), scores_list in dim_scores_map.items():
            aggregated_dim_scores.append({
                "dimension": dim,
                "category": cat,
                "score": round(sum(scores_list) / len(scores_list)),
            })

        # Collect all findings from all experts
        all_findings = []
        for a in assessments:
            for f in a.findings:
                all_findings.append({
                    "dimension": f.dimension,
                    "severity": f.severity.value if hasattr(f.severity, "value") else str(f.severity),
                    "text": f.text,
                    "evidence": f.evidence,
                    "framework_ref": f.framework_ref,
                    "source_expert": a.expert_name,
                })

        # ── Narrative synthesis ───────────────────────────────────────────
        # Try LLM synthesis first (one extra API call). On any failure, fall
        # back to math-only templates so aggregate never crashes.
        synthesis_used = False
        synthesis_data = None
        if synthesizer is not None:
            self._fire_progress(on_progress, step_aggregate, "running",
                                "Synthesizing council briefing...", 92)
            try:
                sys_prompt, user_msg = build_aggregate_synthesis_prompt(
                    eval_input, assessments, final_verdict, avg_score, confidence, agreement_rate,
                )
                raw = synthesizer._call_llm(sys_prompt, user_msg)
                synthesis_data = synthesizer.extract_json(raw)
                # Track the extra call against totals — synthesizer.total_*
                # already incremented during _call_llm; recompute delta by
                # re-summing across experts.
                api_calls = sum(e.total_api_calls for e in self.experts)
                input_tokens = sum(e.total_input_tokens for e in self.experts)
                output_tokens = sum(e.total_output_tokens for e in self.experts)
                synthesis_used = True
                logger.info(f"[AggregateOrchestrator] Synthesis complete via {synthesizer.name}")
            except Exception as e:
                logger.error(f"[AggregateOrchestrator] Synthesis failed, falling back to templates: {e}")
                synthesis_data = None

        # Fallback path (or supplement missing fields) — math-only templates
        if synthesis_data is None:
            synthesis_data = {}

        # agreements / disagreements — prefer LLM; fall back to math
        agreements = synthesis_data.get("agreements") or []
        disagreements = synthesis_data.get("disagreements") or []
        if not agreements and not disagreements:
            for (dim, cat), scores_list in dim_scores_map.items():
                if max(scores_list) - min(scores_list) > 15:
                    disagreements.append(
                        f"Experts disagreed on {dim} (scores: {scores_list}); statistical average applied."
                    )
                elif len(scores_list) >= 2:
                    agreements.append(f"Experts aligned on {dim} (scores: {scores_list})")

        # mitigations — prefer LLM clustered output; fall back to per-finding template
        mitigations = synthesis_data.get("mitigations")
        if not mitigations:
            mitigations = self._generate_mitigations(all_findings)

        # debate_transcript — prefer LLM briefing; fall back to synthetic summary
        transcript = synthesis_data.get("debate_transcript")
        if not transcript:
            transcript = []
            for a in assessments:
                transcript.append({
                    "speaker": a.expert_name,
                    "topic": "Independent Assessment",
                    "message": (
                        f"Overall score: {a.overall_score}/100. "
                        f"Verdict: {a.verdict.value if hasattr(a.verdict, 'value') else a.verdict}. "
                        f"Found {len(a.findings)} issues."
                    ),
                    "message_type": "argument",
                })
            if disagreements:
                transcript.append({
                    "speaker": "Council",
                    "topic": "Statistical Aggregation",
                    "message": (
                        f"Resolved {len(disagreements)} disagreement(s) by averaging scores. "
                        f"Final score: {avg_score}/100, Verdict: {final_verdict}."
                    ),
                    "message_type": "resolution",
                })

        # executive_summary — prefer LLM; fall back to template
        executive_summary = synthesis_data.get("executive_summary")
        if not executive_summary:
            top_concerns = []
            for a in assessments:
                for f in a.findings:
                    sev = f.severity.value if hasattr(f.severity, "value") else str(f.severity)
                    if sev in ("CRITICAL", "HIGH") and f.dimension not in top_concerns:
                        top_concerns.append(f.dimension)
                    if len(top_concerns) >= 3:
                        break
                if len(top_concerns) >= 3:
                    break
            verdict_text = {
                "APPROVE": "is safe to deploy",
                "REVIEW": "needs changes before it can be deployed safely",
                "REJECT": "is not ready for deployment",
            }.get(final_verdict, "needs changes before it can be deployed safely")
            concerns_text = (
                ", ".join(top_concerns[:-1]) + " and " + top_concerns[-1]
                if len(top_concerns) >= 2
                else (top_concerns[0] if top_concerns else "a few areas identified by the council")
            )
            first_mit_text = ""
            if mitigations:
                first_mit_text = mitigations[0].get("text", "") if isinstance(mitigations[0], dict) else ""
            executive_summary = (
                f"The SafeCouncil reviewed {eval_input.agent_name} using the Aggregate method and concluded that it {verdict_text}. "
                f"The experts reached their verdict with about {confidence}% confidence and {agreement_rate}% agreement. "
                f"The most important concerns are: {concerns_text}. "
                f"Recommended next step: {first_mit_text or 'review the full council report for detailed findings.'}"
            )

        elapsed = time.time() - start_time

        from datetime import datetime, timezone

        return {
            "eval_id": "",  # Set by EvaluationService after return
            "agent_name": eval_input.agent_name,
            "orchestrator_method": "aggregate",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "executive_summary": executive_summary,
            "expert_assessments": [self._assessment_to_dict(a) for a in assessments],
            "conversations": [{"label": c.label, "prompt": c.prompt, "output": c.output} for c in eval_input.conversations],
            "debate_transcript": transcript,
            "agreements": agreements[:5],
            "disagreements": disagreements[:5],
            "verdict": {
                "final_verdict": final_verdict,
                "confidence": confidence,
                "agreement_rate": agreement_rate,
            },
            "mitigations": mitigations,
            "audit": {
                "total_api_calls": api_calls,
                "total_input_tokens": input_tokens,
                "total_output_tokens": output_tokens,
                "total_tokens_used": input_tokens + output_tokens,
                "evaluation_time_seconds": elapsed,
                "total_cost_usd": self._estimate_cost(assessments),
                "synthesis_used": synthesis_used,
            },
        }

    def _assessment_to_dict(self, a: ExpertAssessment) -> dict:
        """Convert ExpertAssessment to dict for result."""
        return {
            "expert_name": a.expert_name,
            "llm_provider": a.llm_provider,
            "overall_score": a.overall_score,
            "verdict": a.verdict.value if hasattr(a.verdict, "value") else str(a.verdict),
            "dimension_scores": [
                {"dimension": ds.dimension, "category": ds.category, "score": ds.score, "detail": ds.detail}
                for ds in a.dimension_scores
            ],
            "findings": [
                {
                    "dimension": f.dimension,
                    "severity": f.severity.value if hasattr(f.severity, "value") else str(f.severity),
                    "text": f.text,
                    "evidence": f.evidence,
                    "framework_ref": f.framework_ref,
                }
                for f in a.findings
            ],
            "timestamp": a.timestamp,
        }

    def _generate_mitigations(self, findings: list) -> list:
        """Generate prioritized mitigations from findings."""
        severity_priority = {"CRITICAL": "P0", "HIGH": "P1", "MEDIUM": "P2", "LOW": "P3"}
        mitigations = []
        seen = set()

        sorted_findings = sorted(findings, key=lambda f: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(f["severity"], 4))

        for f in sorted_findings:
            key = f["dimension"]
            if key in seen:
                continue
            seen.add(key)
            mitigations.append({
                "priority": severity_priority.get(f["severity"], "P3"),
                "text": f"Address {f['dimension']}: {f['text'][:200]}",
                "owner": "Engineering",
                "expert_consensus": f"Flagged by {f.get('source_expert', 'expert')}",
            })

        return mitigations[:10]

    def _estimate_cost(self, assessments: list) -> float:
        """Rough cost estimate based on provider."""
        cost = 0.0
        pricing = {
            "claude": {"input": 0.003, "output": 0.015},
            "openai": {"input": 0.0025, "output": 0.010},
            "gemini": {"input": 0.00125, "output": 0.005},
            "local": {"input": 0.0, "output": 0.0},
        }
        for a in assessments:
            rates = pricing.get(a.llm_provider, pricing.get("gemini"))
            # Rough estimate: 2000 input, 2000 output tokens per eval
            cost += (2000 * rates["input"] + 2000 * rates["output"]) / 1000
        return round(cost, 4)
