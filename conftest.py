"""
Root conftest.py: adds app src paths to sys.path and mocks heavy dependencies
that are not available in the lightweight test venv.
Heavy runtime deps (prefect, pystac_client, boto3, h5py, rasterio, etc.)
are mocked at import time so pure logic tests can run without them.
"""
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

# ─── Source paths ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))
sys.path.insert(0, str(ROOT / "apps" / "workers" / "src"))


# ─── Mock heavy dependencies ───────────────────────────────────────────────────
def _mock_module(name: str, **attrs) -> MagicMock:
    mod = MagicMock()
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    return mod


# prefect
prefect_mod = _mock_module("prefect")
prefect_mod.flow = lambda *a, **kw: (lambda fn: fn)
prefect_mod.task = lambda *a, **kw: (lambda fn: fn)
_mock_module("prefect.tasks", task_input_hash=lambda *a, **kw: None)

# pystac / pystac_client
_mock_module("pystac")
_mock_module("pystac_client")

# boto3 / botocore
_mock_module("boto3")
_mock_module("botocore")
_mock_module("botocore.exceptions", ClientError=Exception)

# h5py
_mock_module("h5py")

# httpx  ← real one is installed; don't mock it
# rasterio
_mock_module("rasterio")
_mock_module("rasterio.transform", from_bounds=MagicMock(return_value=None))
_mock_module("rasterio.features", rasterize=MagicMock(return_value=None))

# asyncpg
_mock_module("asyncpg")

# geopandas / shapely
_mock_module("geopandas")
_mock_module("shapely")
_mock_module("shapely.geometry", shape=MagicMock(), mapping=MagicMock())
_mock_module("shapely.ops", unary_union=MagicMock())

# presidio
_mock_module("presidio_analyzer")
_mock_module("presidio_anonymizer")

# social ingestion deps
_mock_module("praw")
_mock_module("atproto")
_mock_module("feedparser")
_mock_module("telethon")
