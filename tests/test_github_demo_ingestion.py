"""
Regression tests for Fix 4: demo mode with a GitHub URL must produce findings
that cite filenames from the actual repo — not hardcoded VeriMedia strings.

Uses monkeypatched GitHub helpers so tests stay offline and fast.
"""
import importlib
import os
import time

import pytest


@pytest.mark.unit
class TestGitHubEnrichmentInDemoMode:
    def _reload_demo(self):
        os.environ["ANTHROPIC_API_KEY"] = ""
        os.environ["OPENAI_API_KEY"] = ""
        os.environ["GOOGLE_API_KEY"] = ""
        os.environ["DEMO_MODE"] = "true"
        import config
        importlib.reload(config)

    def _patch_github(self, monkeypatch, files_by_name):
        """
        Replace the public GitHub fetchers so tests never hit the network.
        files_by_name: {repo_name: [list of file paths]}.
        """
        import services.github_ingestion_service as gh

        def fake_parse(url):
            # Last path component is the repo name
            parts = url.rstrip("/").split("/")
            return parts[-2], parts[-1]

        def fake_fetch_raw(owner, repo, branch, path):
            if path.lower().startswith("readme"):
                return f"# {repo}\n\nA fake README for testing."
            return None

        def fake_list_tree(owner, repo, branch):
            return files_by_name.get(repo, [])

        monkeypatch.setattr(gh, "parse_github_url", fake_parse)
        monkeypatch.setattr(gh, "_fetch_raw", fake_fetch_raw)
        monkeypatch.setattr(gh, "_list_repo_tree", fake_list_tree)

    def _run(self, agent_name, github_url):
        from services.evaluation_service import EvaluationService
        from experts.llm_providers.offline_provider import clear_facts_cache
        from models.schemas import EvaluationInput

        clear_facts_cache()
        svc = EvaluationService()
        inp = EvaluationInput.from_dict({
            "agent_name": agent_name,
            "input_method": "api_probe",
            "api_config": {"github_url": github_url},
            "experts": [{"llm": "offline", "enabled": True}],
            "conversations": [{"label": "demo", "prompt": "hi", "output": "hello"}],
            "orchestration_method": "deliberative",
            "frameworks": [],
        })
        eid = svc.submit_evaluation(inp)
        deadline = time.time() + 20
        while time.time() < deadline:
            status = svc.get_status(eid)
            if status and status.status.value in ("complete", "failed"):
                break
            time.sleep(0.1)
        return svc.get_result(eid)

    def test_verimedia_demo_cites_repo_files(self, monkeypatch):
        self._reload_demo()
        self._patch_github(monkeypatch, {
            "VeriMedia": ["README.md", "app.py", "finetune.py", "requirements.txt"],
        })
        result = self._run("VeriMedia", "https://github.com/FlashCarrot/VeriMedia")
        assert result is not None
        # At least one finding or mitigation should cite a real repo file
        all_text = []
        for a in result["expert_assessments"]:
            for f in a["findings"]:
                all_text.append(f.get("text", "") + " " + f.get("evidence", ""))
        for m in result["mitigations"]:
            all_text.append(m.get("text", ""))
        body = "\n".join(all_text)
        assert "app.py" in body, f"Expected app.py citation somewhere, got: {body[:500]}"

    def test_non_verimedia_demo_cites_its_own_files_not_verimedia(self, monkeypatch):
        """
        Rubric requirement: a hardcoded demo that only works with VeriMedia
        scores 0 on D2.1. A different repo must produce a report that
        references its OWN files — not VeriMedia's.
        """
        self._reload_demo()
        self._patch_github(monkeypatch, {
            "MyCustomRepo": ["README.md", "src/bot/handler.py", "src/bot/config.py"],
        })
        result = self._run("MyCustomRepo", "https://github.com/someone/MyCustomRepo")
        assert result is not None

        body_parts = []
        for a in result["expert_assessments"]:
            for f in a["findings"]:
                body_parts.append(f.get("text", "") + " " + f.get("evidence", ""))
        for m in result["mitigations"]:
            body_parts.append(m.get("text", ""))
        for msg in result.get("debate_transcript", []):
            body_parts.append(msg.get("message", ""))
        body = "\n".join(body_parts).lower()

        # No VeriMedia-specific strings should leak into a non-VeriMedia run
        assert "verimedia" not in body, "VeriMedia strings leaked into non-VeriMedia demo output"
        # At least one reference to the repo's own file(s)
        assert "handler.py" in body or "config.py" in body, (
            f"Expected a citation from MyCustomRepo files, got: {body[:500]}"
        )

    def test_facts_cache_isolates_between_runs(self, monkeypatch):
        """
        The per-agent cache must not leak filenames from one run into the next.
        """
        self._reload_demo()
        self._patch_github(monkeypatch, {
            "RepoA": ["README.md", "repo_a_main.py"],
            "RepoB": ["README.md", "repo_b_main.py"],
        })
        result_a = self._run("RepoA", "https://github.com/x/RepoA")
        result_b = self._run("RepoB", "https://github.com/x/RepoB")

        body_a = " ".join(
            f.get("evidence", "")
            for asm in result_a["expert_assessments"]
            for f in asm["findings"]
        )
        body_b = " ".join(
            f.get("evidence", "")
            for asm in result_b["expert_assessments"]
            for f in asm["findings"]
        )
        assert "repo_a_main.py" in body_a
        assert "repo_b_main.py" in body_b
        assert "repo_a_main.py" not in body_b, "RepoA facts leaked into RepoB run"
        assert "repo_b_main.py" not in body_a, "RepoB facts leaked into RepoA run"
