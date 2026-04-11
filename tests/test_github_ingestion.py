"""Unit tests for github_ingestion_service profile unwrapping and validation."""
import json
from unittest.mock import MagicMock

import pytest

from services.github_ingestion_service import (
    _unwrap_profile,
    extract_agent_profile,
)


# ─── _unwrap_profile ─────────────────────────────────────────────────────────


class TestUnwrapProfile:
    def test_flat_profile_returned_asis(self):
        data = {"agent_name": "Bot", "system_prompt": "sp", "use_case": "uc"}
        assert _unwrap_profile(data) is data

    def test_wrapped_in_agent_profile_key(self):
        inner = {"agent_name": "Bot", "system_prompt": "sp", "use_case": "uc"}
        wrapped = {"agent_profile": inner}
        assert _unwrap_profile(wrapped) == inner

    def test_wrapped_in_response_key(self):
        inner = {"agent_name": "Bot", "system_prompt": "sp", "use_case": "uc"}
        wrapped = {"response": inner}
        assert _unwrap_profile(wrapped) == inner

    def test_wrapped_in_arbitrary_key(self):
        inner = {"agent_name": "Bot", "system_prompt": "sp", "use_case": "uc"}
        wrapped = {"data": inner}
        assert _unwrap_profile(wrapped) == inner

    def test_partial_flat_profile(self):
        """Only one of the required keys — still considered flat."""
        data = {"agent_name": "Bot", "extra": "field"}
        assert _unwrap_profile(data) is data

    def test_nested_without_required_keys(self):
        """Nested dict has no required keys — return original so downstream fails."""
        data = {"foo": {"bar": "baz"}}
        assert _unwrap_profile(data) == data

    def test_empty_dict(self):
        assert _unwrap_profile({}) == {}


# ─── extract_agent_profile ───────────────────────────────────────────────────


def _make_provider(raw_json: str):
    """Build a mock LLM provider returning the given raw response text."""
    provider = MagicMock()
    response = MagicMock()
    response.text = raw_json
    provider.call.return_value = response
    return provider


REPO_DATA = {
    "readme": "# Test Repo\nA test agent.",
    "code_files": {"app.py": "print('hi')"},
    "example_files": {},
}


class TestExtractAgentProfile:
    def test_claude_style_flat_response(self):
        raw = json.dumps({
            "agent_name": "TestBot",
            "system_prompt": "You are TestBot",
            "use_case": "Testing agents",
            "environment": "Flask app",
            "data_sensitivity": "Low",
            "interface_type": "chatbot",
            "test_probes": [{"label": "hi", "category": "normal", "prompt": "hello"}],
            "architecture_notes": ["Flask route in app.py"],
        })
        provider = _make_provider(raw)
        profile = extract_agent_profile(REPO_DATA, "test-repo", provider)
        assert profile["agent_name"] == "TestBot"
        assert profile["system_prompt"] == "You are TestBot"
        assert profile["interface_type"] == "chatbot"
        assert len(profile["test_probes"]) == 1

    def test_gpt4o_style_wrapped_response(self):
        """GPT-4o sometimes wraps as {"agent_profile": {...}}. Must unwrap."""
        inner = {
            "agent_name": "WrappedBot",
            "system_prompt": "You are WrappedBot",
            "use_case": "Testing wrapper detection",
            "environment": "Flask app",
            "data_sensitivity": "Medium",
            "interface_type": "content_analyzer",
            "test_probes": [],
            "architecture_notes": [],
        }
        raw = json.dumps({"agent_profile": inner})
        provider = _make_provider(raw)
        profile = extract_agent_profile(REPO_DATA, "test-repo", provider)
        assert profile["agent_name"] == "WrappedBot"
        assert profile["interface_type"] == "content_analyzer"

    def test_gemini_style_response_key(self):
        inner = {
            "agent_name": "GeminiBot",
            "system_prompt": "You are GeminiBot",
            "use_case": "Testing Gemini wrapper",
        }
        raw = json.dumps({"response": inner})
        provider = _make_provider(raw)
        profile = extract_agent_profile(REPO_DATA, "test-repo", provider)
        assert profile["agent_name"] == "GeminiBot"

    def test_completely_wrong_schema_raises(self):
        """If none of the required keys can be found, fail loudly."""
        raw = json.dumps({"foo": "bar", "baz": {"qux": "nope"}})
        provider = _make_provider(raw)
        with pytest.raises(RuntimeError, match="Could not extract agent profile"):
            extract_agent_profile(REPO_DATA, "test-repo", provider)

    def test_partial_extraction_fills_defaults(self):
        """Missing non-required fields should get defaults, not fail."""
        raw = json.dumps({
            "agent_name": "PartialBot",
            "system_prompt": "You are PartialBot",
            "use_case": "Partial extraction test",
            # environment, data_sensitivity, etc. missing
        })
        provider = _make_provider(raw)
        profile = extract_agent_profile(REPO_DATA, "test-repo", provider)
        assert profile["agent_name"] == "PartialBot"
        assert profile["environment"] == "Unknown deployment environment"
        assert profile["data_sensitivity"] == "Medium"
        assert profile["interface_type"] == "chatbot"
        assert profile["test_probes"] == []
        assert profile["architecture_notes"] == []

    def test_partial_extraction_missing_one_required(self):
        """If only 1-2 required keys present, fill missing with 'Unknown ...'."""
        raw = json.dumps({
            "agent_name": "HalfBot",
            "system_prompt": "You are HalfBot",
            # use_case missing
        })
        provider = _make_provider(raw)
        profile = extract_agent_profile(REPO_DATA, "test-repo", provider)
        assert profile["agent_name"] == "HalfBot"
        assert "Unknown use_case" in profile["use_case"]
