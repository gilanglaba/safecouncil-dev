"""Unit tests for ProbeService JSON extraction."""
import pytest

from services.probe_service import ProbeService


class TestUnwrapDict:
    """Tests for _unwrap_dict static method."""

    def test_dict_with_results_array(self):
        data = {"results": [{"a": 1}, {"b": 2}]}
        assert ProbeService._unwrap_dict(data) == [{"a": 1}, {"b": 2}]

    def test_dict_with_responses_array(self):
        data = {"responses": [{"x": 1}]}
        assert ProbeService._unwrap_dict(data) == [{"x": 1}]

    def test_dict_without_nested_list(self):
        data = {"label": "test", "count": 5}
        assert ProbeService._unwrap_dict(data) == [{"label": "test", "count": 5}]

    def test_dict_with_empty_list(self):
        """Empty list has no dicts — wraps the whole dict."""
        data = {"results": []}
        assert ProbeService._unwrap_dict(data) == [{"results": []}]

    def test_dict_with_list_of_non_dicts(self):
        """List of strings, not dicts — wraps the whole dict."""
        data = {"tags": ["a", "b", "c"]}
        assert ProbeService._unwrap_dict(data) == [{"tags": ["a", "b", "c"]}]

    def test_picks_first_list_of_dicts(self):
        data = {"meta": "info", "items": [{"a": 1}], "other": [{"b": 2}]}
        result = ProbeService._unwrap_dict(data)
        assert len(result) == 1
        assert result[0]["a"] == 1


class TestExtractJsonArray:
    """Tests for _extract_json_array static method."""

    # ── Strategy 1: Direct parse ─────────────────────────────────────────

    def test_clean_array(self):
        raw = '[{"label": "a", "prompt": "b", "output": "c"}]'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 1
        assert result[0]["label"] == "a"

    def test_wrapper_object_results_key(self):
        """GPT-4o commonly wraps in {"results": [...]}."""
        raw = '{"results": [{"label": "a"}, {"label": "b"}]}'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 2
        assert result[0]["label"] == "a"
        assert result[1]["label"] == "b"

    def test_wrapper_object_responses_key(self):
        raw = '{"responses": [{"label": "x"}]}'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 1
        assert result[0]["label"] == "x"

    def test_single_dict_no_nested_list(self):
        raw = '{"label": "solo", "prompt": "test"}'
        result = ProbeService._extract_json_array(raw)
        assert result == [{"label": "solo", "prompt": "test"}]

    # ── Strategy 2: Markdown code blocks ─────────────────────────────────

    def test_markdown_wrapped_array(self):
        raw = '```json\n[{"a": 1}, {"b": 2}]\n```'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 2

    def test_markdown_wrapped_wrapper_object(self):
        raw = '```json\n{"results": [{"a": 1}]}\n```'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 1
        assert result[0]["a"] == 1

    def test_markdown_no_language_tag(self):
        raw = '```\n[{"x": 1}]\n```'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 1

    # ── Strategy 3: Bracket matching ─────────────────────────────────────

    def test_array_with_preamble_text(self):
        raw = 'Here are the results:\n[{"x": 1}]'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 1

    def test_array_with_surrounding_text(self):
        raw = 'Output:\n[{"a": 1}, {"b": 2}]\nDone.'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 2

    # ── Strategy 4: Brace matching (wrapper object with preamble) ────────

    def test_wrapper_object_with_preamble(self):
        raw = 'Here is the JSON:\n{"results": [{"x": 1}, {"y": 2}]}'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 2

    # ── Strategy 5: JSONL ────────────────────────────────────────────────

    def test_jsonl(self):
        raw = '{"a": 1}\n{"b": 2}\n{"c": 3}'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 3

    def test_jsonl_with_trailing_commas(self):
        raw = '{"a": 1},\n{"b": 2},\n{"c": 3}'
        result = ProbeService._extract_json_array(raw)
        assert len(result) == 3

    # ── Error cases ──────────────────────────────────────────────────────

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="Could not extract JSON array"):
            ProbeService._extract_json_array("no json here at all")

    def test_plain_string_raises(self):
        with pytest.raises(ValueError):
            ProbeService._extract_json_array("just some text")
