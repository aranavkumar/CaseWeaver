import os
import tempfile

# Point the app at a throwaway SQLite DB *before* importing it.
_DB = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["CASEWEAVER_DB_PATH"] = _DB
os.environ["CASEWEAVER_STORAGE_DIR"] = os.path.dirname(_DB) + "/storage"
os.environ["CASEWEAVER_MODE"] = "demo"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import repo


@pytest.fixture(autouse=True)
def _clean_db():
    repo.clear_all()
    yield
    repo.clear_all()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
