"""
Regression tests for repository cleanliness.

Addresses the professor's repo-cleanliness deductions:
  1. backend/logs/*.json MUST be gitignored at the file level so a developer
     who accidentally runs a live evaluation and commits cannot push audit
     logs containing sensitive evaluation data.
  2. backend/demo_data.py must stay small — the pre-built demo templates
     live as JSON fixtures under backend/demo_fixtures/ rather than as
     deeply nested inline Python dicts.
"""
import os
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.unit
class TestLogsGitIgnored:
    def test_gitignore_contains_logs_pattern(self):
        gitignore = (REPO_ROOT / ".gitignore").read_text()
        assert "backend/logs/*.json" in gitignore, (
            ".gitignore must explicitly ignore backend/logs/*.json "
            "— otherwise a dev who accidentally commits after a live "
            "evaluation can push sensitive audit logs."
        )
        # .gitkeep must be unignored so the directory is preserved
        assert "!backend/logs/.gitkeep" in gitignore

    def test_git_check_ignore_actually_ignores_audit_log(self):
        """Verify the rule actually fires via `git check-ignore`."""
        # Don't touch a real file — just ask git if a hypothetical path matches
        fake = "backend/logs/0000abcd.json"
        result = subprocess.run(
            ["git", "check-ignore", "-v", fake],
            cwd=REPO_ROOT, capture_output=True, text=True,
        )
        # exit code 0 = ignored, 1 = not ignored
        assert result.returncode == 0, (
            f"backend/logs/*.json rule did not match {fake}: {result.stderr}"
        )
        assert "backend/logs/*.json" in result.stdout

    def test_no_audit_logs_tracked_in_git(self):
        """Tracked files under backend/logs/ should only be .gitkeep."""
        result = subprocess.run(
            ["git", "ls-files", "backend/logs/"],
            cwd=REPO_ROOT, capture_output=True, text=True,
        )
        tracked = [line for line in result.stdout.strip().split("\n") if line]
        for path in tracked:
            assert path.endswith(".gitkeep"), (
                f"Unexpected tracked file in backend/logs/: {path} "
                "— audit logs should never be tracked."
            )


@pytest.mark.unit
class TestDemoDataFileSize:
    def test_demo_data_py_is_not_bloated(self):
        """demo_data.py should stay small — large fixtures live in JSON files."""
        size = (REPO_ROOT / "backend" / "demo_data.py").stat().st_size
        # The inline Python dicts were 41KB; after extracting fixtures this
        # should be well under 20KB. 25KB is a conservative ceiling.
        assert size < 25_000, (
            f"backend/demo_data.py is {size} bytes — the large demo result "
            "templates should live as JSON fixtures under backend/demo_fixtures/ "
            "rather than as inline nested Python dicts."
        )

    def test_demo_fixtures_directory_exists_and_has_templates(self):
        fixtures_dir = REPO_ROOT / "backend" / "demo_fixtures"
        assert fixtures_dir.is_dir(), (
            "backend/demo_fixtures/ should exist with the demo result templates"
        )
        assert (fixtures_dir / "wfp_deliberative.json").is_file()
        assert (fixtures_dir / "verimedia_deliberative.json").is_file()

    def test_fixtures_load_and_match_module_exports(self):
        """Round-trip: the JSON fixtures must match what demo_data exposes."""
        import json
        fixtures_dir = REPO_ROOT / "backend" / "demo_fixtures"
        with open(fixtures_dir / "wfp_deliberative.json") as f:
            wfp_raw = json.load(f)
        with open(fixtures_dir / "verimedia_deliberative.json") as f:
            ver_raw = json.load(f)

        from demo_data import DEMO_RESULT_WFP, DEMO_RESULT_VERIMEDIA
        assert DEMO_RESULT_WFP == wfp_raw
        assert DEMO_RESULT_VERIMEDIA == ver_raw
        # Sanity: VeriMedia fixture carries its distinct scores and agent name
        assert [a["overall_score"] for a in ver_raw["expert_assessments"]] == [58, 62, 55]
        assert "VeriMedia" in ver_raw["agent_name"]
