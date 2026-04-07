"""
SafeCouncil test demo data — re-exports from backend/demo_data.py.

This file exists so tests can `from tests.demo_data import DEMO_INPUT`
without hardcoding the backend path. The single source of truth lives in
backend/demo_data.py.

We use importlib.util to load the backend file directly by absolute path
because pytest's collection adds tests/ to sys.path, which would otherwise
make `from demo_data import ...` resolve to this file itself (circular).
"""
import importlib.util
import os

_BACKEND_DEMO_DATA = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "demo_data.py")
)
_spec = importlib.util.spec_from_file_location("_safecouncil_backend_demo_data", _BACKEND_DEMO_DATA)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

DEMO_INPUT = _module.DEMO_INPUT
CATALOG_DATA = _module.CATALOG_DATA
CATALOG_GITHUB_URLS = _module.CATALOG_GITHUB_URLS
CATALOG_PROFILES = _module.CATALOG_PROFILES
DEMO_RESULT_WFP = _module.DEMO_RESULT_WFP
DEMO_RESULT_VERIMEDIA = _module.DEMO_RESULT_VERIMEDIA
