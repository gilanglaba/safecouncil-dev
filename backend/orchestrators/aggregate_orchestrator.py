"""
AggregateOrchestrator — Method A: Statistical Consensus.
Each expert evaluates independently, scores are averaged, verdict by majority vote.
No inter-agent communication. Fast and deterministic.
"""
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

logger = logging.getLogger(__name__)

# Step indices for progress tracking
STEP_GOVERNANCE = 0
# Expert steps are dynamic: STEP_GOVERNANCE + 1 + expert_index
STEP_AGGREGATE = -1  # Set dynamically


class AggregateOrchestrator(BaseOrchestrator):
    """
    Method A: Independent Scoring with Statistical Aggregation.
    - Each expert evaluates independently
    - Final scores = mean of expert scores
    - Final verdict = majority vote
    - Disagreements detected but NOT resolved through debate
    """

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

        # ── Steps 1..N: Independent expert evaluations ────────────────────
        assessments: List[ExpertAssessment] = []
        for i, expert in enumerate(self.experts):
            step_idx = STEP_GOVERNANCE + 1 + i
            progress_pct = 5 + int((i / num_experts) * 80)

            self._fire_progress(on_progress, step_idx, "running",
                                f"{expert.name} evaluating...", progress_pct)
            try:
                assessment = expert.evaluate(eval_input, governance_context)
                assessments.append(assessment)
                total_api_calls += expert.total_api_calls
                total_input_tokens += expert.total_input_tokens
                total_output_tokens += expert.total_output_tokens
                self._fire_progress(on_progress, step_idx, "complete",
                                    f"{expert.name} complete", progress_pct + int(80 / num_experts))
            except Exception as e:
                logger.error(f"Expert {expert.name} failed: {e}")
                self._fire_progress(on_progress, step_idx, "failed",
                                    f"{expert.name} failed: {str(e)[:100]}", progress_pct)

        if not assessments:
            raise RuntimeError("All experts failed. Cannot produce evaluation.")

        # ── Final step: Aggregate scores ──────────────────────────────────
        self._fire_progress(on_progress, step_aggregate, "running",
                            "Aggregating expert scores...", 90)

        result = self._aggregate(assessments, eval_input, start_time,
                                 total_api_calls, total_input_tokens, total_output_tokens)

        self._fire_progress(on_progress, step_aggregate, "complete",
                            "Aggregation complete", 100)

        return result

    def _aggregate(self, assessments: List[ExpertAssessment], eval_input: EvaluationInput,
                   start_time: float, api_calls: int, input_tokens: int, output_tokens: int) -> dict:
        """Aggregate expert assessments using statistical methods."""

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

        # Detect disagreements (>15 point delta between any two experts on same dimension)
        agreements = []
        disagreements = []
        for (dim, cat), scores_list in dim_scores_map.items():
            if max(scores_list) - min(scores_list) > 15:
                disagreements.append({
                    "topic": dim,
                    "resolution": f"Experts disagree (scores: {scores_list}). Statistical average used.",
                })
            elif len(scores_list) >= 2:
                agreements.append(f"Experts agree on {dim} (scores: {scores_list})")

        # Generate simple mitigations from findings
        mitigations = self._generate_mitigations(all_findings)

        # Build a simple "transcript" that shows the aggregation process
        transcript = []
        for a in assessments:
            transcript.append({
                "speaker": a.expert_name,
                "topic": "Independent Assessment",
                "message": f"Overall score: {a.overall_score}/100. Verdict: {a.verdict.value if hasattr(a.verdict, 'value') else a.verdict}. Found {len(a.findings)} issues.",
                "message_type": "assessment",
            })
        if disagreements:
            transcript.append({
                "speaker": "Council",
                "topic": "Statistical Aggregation",
                "message": f"Resolved {len(disagreements)} disagreement(s) by averaging scores. Final score: {avg_score}/100, Verdict: {final_verdict}.",
                "message_type": "resolution",
            })

        elapsed = time.time() - start_time

        return {
            "eval_id": "",  # Set by EvaluationService after return
            "agent_name": eval_input.agent_name,
            "orchestrator_method": "aggregate",
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
                "evaluation_time_seconds": elapsed,
                "total_cost_usd": self._estimate_cost(assessments),
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
