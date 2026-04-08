"""Unit tests for Config — placeholder detection + DEMO_MODE auto-detection."""
import importlib
import os

import pytest


@pytest.mark.unit
class TestIsRealKey:
    def test_empty_string_not_real(self):
        from config import _is_real_key
        assert _is_real_key("") is False
        assert _is_real_key("   ") is False

    def test_none_not_real(self):
        from config import _is_real_key
        assert _is_real_key(None) is False

    def test_placeholder_not_real(self):
        from config import _is_real_key
        assert _is_real_key("your_anthropic_api_key_here") is False
        assert _is_real_key("your_openai_api_key_here") is False
        assert _is_real_key("your_google_api_key_here") is False
        assert _is_real_key("YOUR_API_KEY_HERE") is False

    def test_sentinels_not_real(self):
        from config import _is_real_key
        for v in ("changeme", "placeholder", "none", "null", "NONE"):
            assert _is_real_key(v) is False, f"{v!r} should be rejected"

    def test_real_keys_accepted(self):
        from config import _is_real_key
        assert _is_real_key("sk-ant-api03-abcdef1234567890") is True
        assert _is_real_key("sk-proj-abc123") is True
        assert _is_real_key("AIzaSyABCDEF") is True


@pytest.mark.unit
class TestDemoModeAutoDetection:
    def _reload(self, env):
        """Reload config with a given env dict."""
        for k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "DEMO_MODE"):
            os.environ.pop(k, None)
        os.environ.update(env)
        import config
        importlib.reload(config)
        return config.Config

    def test_all_placeholders_triggers_demo_mode(self):
        """First-timer footgun: `make setup` copies placeholders; demo should engage."""
        Config = self._reload({
            "ANTHROPIC_API_KEY": "your_anthropic_api_key_here",
            "OPENAI_API_KEY": "your_openai_api_key_here",
            "GOOGLE_API_KEY": "your_google_api_key_here",
            "DEMO_MODE": "auto",
        })
        assert Config.DEMO_MODE is True

    def test_all_empty_triggers_demo_mode(self):
        Config = self._reload({
            "ANTHROPIC_API_KEY": "",
            "OPENAI_API_KEY": "",
            "GOOGLE_API_KEY": "",
            "DEMO_MODE": "auto",
        })
        assert Config.DEMO_MODE is True

    def test_real_key_disables_demo_mode(self):
        Config = self._reload({
            "ANTHROPIC_API_KEY": "sk-ant-api03-abcdef1234567890",
            "OPENAI_API_KEY": "",
            "GOOGLE_API_KEY": "",
            "DEMO_MODE": "auto",
        })
        assert Config.DEMO_MODE is False

    def test_explicit_true_overrides_keys(self):
        Config = self._reload({
            "ANTHROPIC_API_KEY": "sk-ant-api03-abcdef1234567890",
            "DEMO_MODE": "true",
        })
        assert Config.DEMO_MODE is True

    def test_explicit_false_overrides_absent_keys(self):
        Config = self._reload({
            "ANTHROPIC_API_KEY": "",
            "OPENAI_API_KEY": "",
            "GOOGLE_API_KEY": "",
            "DEMO_MODE": "false",
        })
        assert Config.DEMO_MODE is False
