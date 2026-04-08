"""
Regression tests for POST /api/evaluate request validation.

Covers Bug 2 from the professor's live-testing report: "GitHub URL input
blocked by conversation validation" — a grader calling the API directly with
input_method=github and empty conversations=[] got 400 Bad Request because
the conversations check fired before the ingestion service could generate
them.
"""
import pytest


@pytest.mark.unit
class TestGitHubInputBypassesConversationValidation:
    def test_input_method_github_with_top_level_url(self):
        from app import _validate_evaluation_input
        body = {
            "agent_name": "VeriMedia",
            "input_method": "github",
            "github_url": "https://github.com/FlashCarrot/VeriMedia",
            "conversations": [],
            "experts": [{"llm": "claude", "enabled": True}],
        }
        ok, msg = _validate_evaluation_input(body)
        assert ok, f"GitHub-URL submission should not require conversations: {msg}"
        # Should have been normalized to api_probe with api_config.github_url
        assert body["input_method"] == "api_probe"
        assert body["api_config"]["github_url"] == "https://github.com/FlashCarrot/VeriMedia"

    def test_input_method_github_with_api_config(self):
        from app import _validate_evaluation_input
        body = {
            "agent_name": "VeriMedia",
            "input_method": "github",
            "api_config": {"github_url": "https://github.com/FlashCarrot/VeriMedia"},
            "experts": [{"llm": "claude", "enabled": True}],
        }
        ok, msg = _validate_evaluation_input(body)
        assert ok, msg
        assert body["input_method"] == "api_probe"

    def test_top_level_github_url_only_no_input_method(self):
        """A grader who just posts {agent_name, github_url, experts} should work."""
        from app import _validate_evaluation_input
        body = {
            "agent_name": "VeriMedia",
            "github_url": "https://github.com/FlashCarrot/VeriMedia",
            "experts": [{"llm": "claude", "enabled": True}],
        }
        ok, msg = _validate_evaluation_input(body)
        assert ok, msg
        assert body["input_method"] == "api_probe"

    def test_canonical_api_probe_still_works(self):
        from app import _validate_evaluation_input
        body = {
            "agent_name": "VeriMedia",
            "input_method": "api_probe",
            "api_config": {"github_url": "https://github.com/FlashCarrot/VeriMedia"},
            "experts": [{"llm": "claude", "enabled": True}],
        }
        ok, msg = _validate_evaluation_input(body)
        assert ok, msg

    def test_manual_mode_still_requires_conversations(self):
        """Regression guard — don't make conversations optional for the manual path."""
        from app import _validate_evaluation_input
        body = {
            "agent_name": "X",
            "input_method": "manual",
            "conversations": [],
            "experts": [{"llm": "claude", "enabled": True}],
        }
        ok, msg = _validate_evaluation_input(body)
        assert not ok
        assert "conversation" in msg.lower()

    def test_case_insensitive_input_method(self):
        from app import _validate_evaluation_input
        body = {
            "agent_name": "VeriMedia",
            "input_method": "GitHub",
            "github_url": "https://github.com/FlashCarrot/VeriMedia",
            "experts": [{"llm": "claude", "enabled": True}],
        }
        ok, msg = _validate_evaluation_input(body)
        assert ok, msg
