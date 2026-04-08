from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from enum import Enum
import json
import os
import uuid
from datetime import datetime, timezone


class Verdict(Enum):
    APPROVE = "APPROVE"
    REVIEW = "REVIEW"
    REJECT = "REJECT"


class Severity(Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class EvalStatus(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class Conversation:
    label: str
    prompt: str
    output: str

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "prompt": self.prompt,
            "output": self.output,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Conversation":
        return cls(
            label=d.get("label", ""),
            prompt=d.get("prompt", ""),
            output=d.get("output", ""),
        )


@dataclass
class ExpertConfig:
    llm: str
    enabled: bool
    custom_api_key: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "llm": self.llm,
            "enabled": self.enabled,
            "custom_api_key": self.custom_api_key,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ExpertConfig":
        return cls(
            llm=d.get("llm", ""),
            enabled=d.get("enabled", False),
            custom_api_key=d.get("custom_api_key"),
        )


@dataclass
class EvaluationInput:
    agent_name: str
    use_case: str
    system_prompt: str
    conversations: List[Conversation]
    environment: str
    data_sensitivity: str
    frameworks: List[str]
    experts: List[ExpertConfig]
    custom_documents: List[str] = field(default_factory=list)
    input_method: Optional[str] = None   # "manual" | "api_probe" | "upload"
    api_config: Optional[dict] = None    # {endpoint, api_key, model, probe_count}
    orchestration_method: Optional[str] = None  # "deliberative" | "aggregate"
    synthesis_provider: Optional[str] = None  # "claude" | "gpt4o" | "gemini" | "local" — None = elect from experts

    def to_dict(self) -> dict:
        return {
            "agent_name": self.agent_name,
            "use_case": self.use_case,
            "system_prompt": self.system_prompt,
            "conversations": [c.to_dict() for c in self.conversations],
            "environment": self.environment,
            "data_sensitivity": self.data_sensitivity,
            "frameworks": self.frameworks,
            "experts": [e.to_dict() for e in self.experts],
            "custom_documents": self.custom_documents,
            "input_method": self.input_method,
            "api_config": self.api_config,
            "orchestration_method": self.orchestration_method,
            "synthesis_provider": self.synthesis_provider,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "EvaluationInput":
        return cls(
            agent_name=d.get("agent_name", ""),
            use_case=d.get("use_case", ""),
            system_prompt=d.get("system_prompt", ""),
            conversations=[
                Conversation.from_dict(c) for c in d.get("conversations", [])
            ],
            environment=d.get("environment", ""),
            data_sensitivity=d.get("data_sensitivity", ""),
            frameworks=d.get("frameworks", []),
            experts=[ExpertConfig.from_dict(e) for e in d.get("experts", [])],
            custom_documents=d.get("custom_documents", []),
            input_method=d.get("input_method"),
            api_config=d.get("api_config"),
            orchestration_method=d.get("orchestration_method"),
            synthesis_provider=d.get("synthesis_provider"),
        )


@dataclass
class DimensionScore:
    dimension: str
    category: str
    score: int  # 0-100
    detail: str

    def to_dict(self) -> dict:
        return {
            "dimension": self.dimension,
            "category": self.category,
            "score": self.score,
            "detail": self.detail,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DimensionScore":
        return cls(
            dimension=d.get("dimension", ""),
            category=d.get("category", ""),
            score=int(d.get("score", 50)),
            detail=d.get("detail", ""),
        )


@dataclass
class Finding:
    dimension: str
    severity: Severity
    text: str
    evidence: str
    framework_ref: Optional[str] = None
    conversation_index: Optional[int] = None  # 0-based index into conversations list
    plain_summary: Optional[str] = None  # plain-language one-liner for non-technical readers

    def to_dict(self) -> dict:
        d = {
            "dimension": self.dimension,
            "severity": self.severity.value,
            "text": self.text,
            "evidence": self.evidence,
            "framework_ref": self.framework_ref,
        }
        if self.conversation_index is not None:
            d["conversation_index"] = self.conversation_index
        if self.plain_summary:
            d["plain_summary"] = self.plain_summary
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Finding":
        severity_str = d.get("severity", "MEDIUM").upper()
        try:
            severity = Severity[severity_str]
        except KeyError:
            severity = Severity.MEDIUM
        return cls(
            dimension=d.get("dimension", ""),
            severity=severity,
            text=d.get("text", ""),
            evidence=d.get("evidence", ""),
            framework_ref=d.get("framework_ref"),
            conversation_index=d.get("conversation_index"),
            plain_summary=d.get("plain_summary"),
        )


@dataclass
class ExpertAssessment:
    expert_name: str
    llm_provider: str
    overall_score: int
    verdict: Verdict
    dimension_scores: List[DimensionScore]
    findings: List[Finding]
    raw_response: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # Deliberative revision fields — populated only when scores change after cross-critique
    initial_overall_score: Optional[int] = None
    initial_dimension_scores: Optional[List[DimensionScore]] = None
    revision_rationale: Optional[str] = None
    score_changes: Optional[List[dict]] = None  # [{dimension, old_score, new_score, influenced_by, justification}]

    def to_dict(self) -> dict:
        d = {
            "expert_name": self.expert_name,
            "llm_provider": self.llm_provider,
            "overall_score": self.overall_score,
            "verdict": self.verdict.value,
            "dimension_scores": [ds.to_dict() for ds in self.dimension_scores],
            "findings": [f.to_dict() for f in self.findings],
            "raw_response": self.raw_response,
            "timestamp": self.timestamp,
        }
        if self.initial_overall_score is not None:
            d["initial_overall_score"] = self.initial_overall_score
        if self.initial_dimension_scores is not None:
            d["initial_dimension_scores"] = [ds.to_dict() for ds in self.initial_dimension_scores]
        if self.revision_rationale:
            d["revision_rationale"] = self.revision_rationale
        if self.score_changes:
            d["score_changes"] = self.score_changes
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "ExpertAssessment":
        verdict_str = d.get("verdict", "REVIEW").upper()
        try:
            verdict = Verdict[verdict_str]
        except KeyError:
            verdict = Verdict.REVIEW
        initial_dims = None
        if d.get("initial_dimension_scores"):
            initial_dims = [DimensionScore.from_dict(ds) for ds in d["initial_dimension_scores"]]
        return cls(
            expert_name=d.get("expert_name", ""),
            llm_provider=d.get("llm_provider", ""),
            overall_score=int(d.get("overall_score", 50)),
            verdict=verdict,
            dimension_scores=[
                DimensionScore.from_dict(ds) for ds in d.get("dimension_scores", [])
            ],
            findings=[Finding.from_dict(f) for f in d.get("findings", [])],
            raw_response=d.get("raw_response", ""),
            timestamp=d.get("timestamp", datetime.now(timezone.utc).isoformat()),
            initial_overall_score=d.get("initial_overall_score"),
            initial_dimension_scores=initial_dims,
            revision_rationale=d.get("revision_rationale"),
            score_changes=d.get("score_changes"),
        )


@dataclass
class DebateMessage:
    speaker: str
    topic: str
    message: str
    message_type: str  # "argument", "agreement", "disagreement", "resolution"

    def to_dict(self) -> dict:
        return {
            "speaker": self.speaker,
            "topic": self.topic,
            "message": self.message,
            "message_type": self.message_type,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DebateMessage":
        return cls(
            speaker=d.get("speaker", ""),
            topic=d.get("topic", ""),
            message=d.get("message", ""),
            message_type=d.get("message_type", "argument"),
        )


@dataclass
class Mitigation:
    priority: str  # "P0", "P1", "P2", "P3"
    text: str
    owner: str
    expert_consensus: str
    plain_summary: Optional[str] = None  # plain-language one-liner for non-technical readers

    def to_dict(self) -> dict:
        d = {
            "priority": self.priority,
            "text": self.text,
            "owner": self.owner,
            "expert_consensus": self.expert_consensus,
        }
        if self.plain_summary:
            d["plain_summary"] = self.plain_summary
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Mitigation":
        return cls(
            priority=d.get("priority", "P2"),
            text=d.get("text", ""),
            owner=d.get("owner", "Engineering"),
            expert_consensus=d.get("expert_consensus", ""),
            plain_summary=d.get("plain_summary"),
        )


@dataclass
class StepStatus:
    step: str
    status: str  # "pending", "running", "complete", "failed"

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "status": self.status,
        }


@dataclass
class CouncilResult:
    expert_assessments: List[ExpertAssessment]
    debate_transcript: List[DebateMessage]
    agreements: List[str]
    disagreements: List[str]
    final_verdict: Verdict
    confidence: int  # 0-100
    agreement_rate: int  # 0-100
    mitigations: List[Mitigation]
    total_api_calls: int
    total_tokens_used: int
    total_cost_usd: float
    evaluation_time_seconds: float
    eval_id: str
    agent_name: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    orchestrator_method: str = "deliberative"
    conversations: List[Conversation] = field(default_factory=list)
    synthesis_fallback: bool = False  # True if synthesis JSON parse failed and deterministic summary was used
    synthesizer_name: Optional[str] = None  # Which expert/provider ran synthesis
    executive_summary: Optional[str] = None  # Plain-English 3-5 sentence summary for non-technical readers

    def to_dict(self) -> dict:
        d = {
            "eval_id": self.eval_id,
            "agent_name": self.agent_name,
            "orchestrator_method": self.orchestrator_method,
            "timestamp": self.timestamp,
            "executive_summary": self.executive_summary,
            "verdict": {
                "final_verdict": self.final_verdict.value,
                "confidence": self.confidence,
                "agreement_rate": self.agreement_rate,
            },
            "expert_assessments": [ea.to_dict() for ea in self.expert_assessments],
            "debate_transcript": [dm.to_dict() for dm in self.debate_transcript],
            "agreements": self.agreements,
            "disagreements": self.disagreements,
            "mitigations": [m.to_dict() for m in self.mitigations],
            "conversations": [c.to_dict() for c in self.conversations],
            "audit": {
                "total_api_calls": self.total_api_calls,
                "total_tokens_used": self.total_tokens_used,
                "total_cost_usd": round(self.total_cost_usd, 4),
                "evaluation_time_seconds": round(self.evaluation_time_seconds, 1),
                "synthesis_fallback": self.synthesis_fallback,
                "synthesizer_name": self.synthesizer_name,
            },
        }
        return d

    def save_to_log(self, log_dir: str) -> str:
        """Save the complete result to a JSON audit log file."""
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, f"{self.eval_id}.json")
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        return log_path


@dataclass
class EvalJob:
    eval_id: str
    status: EvalStatus
    progress: int  # 0-100
    current_step: str
    steps: List[StepStatus]
    result: Optional[CouncilResult]
    error: Optional[str]
    created_at: str

    def to_status_dict(self) -> dict:
        """Serialized for the /status endpoint."""
        base = {
            "eval_id": self.eval_id,
            "status": self.status.value,
            "progress": self.progress,
            "current_step": self.current_step,
            "steps_completed": [s.to_dict() for s in self.steps],
        }
        if self.status == EvalStatus.COMPLETE:
            base["result_url"] = f"/api/evaluate/{self.eval_id}"
        if self.status == EvalStatus.FAILED:
            base["error"] = self.error or "Unknown error"
            base["partial_results"] = self.result is not None
        return base
