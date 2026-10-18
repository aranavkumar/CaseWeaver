"""SQLite persistence behind a small repository interface.

Records are stored as JSON blobs in per-collection tables keyed by (id, case_id).
The repository is the only module that touches SQL, so swapping SQLite for
PostgreSQL later means reimplementing just this file. FK-ish integrity is
enforced at write time (parents must exist for child records).
"""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Optional

from .config import settings
from .schemas import (
    AgentRun,
    AgentStage,
    AuditEvent,
    Case,
    Entity,
    EvidenceItem,
    Finding,
    Observation,
    Relationship,
    ReportVersion,
    ResearchQuery,
    ResearchResult,
    ReviewAction,
    TimelineEvent,
)

# collection name -> model class
MODELS = {
    "cases": Case,
    "evidence": EvidenceItem,
    "observations": Observation,
    "entities": Entity,
    "relationships": Relationship,
    "timeline_events": TimelineEvent,
    "research_queries": ResearchQuery,
    "research_results": ResearchResult,
    "findings": Finding,
    "review_actions": ReviewAction,
    "agent_runs": AgentRun,
    "agent_stages": AgentStage,
    "audit_events": AuditEvent,
    "report_versions": ReportVersion,
}

# collections that must reference an existing case (for FK integrity)
_CASE_SCOPED = [c for c in MODELS if c != "cases"]


class Repository:
    def __init__(self, db_path=None):
        self.db_path = str(db_path or settings.db_path)
        self._lock = threading.Lock()
        self._init_schema()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS kv ("
                "collection TEXT NOT NULL, id TEXT NOT NULL, case_id TEXT, "
                "payload TEXT NOT NULL, PRIMARY KEY (collection, id))"
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_case ON kv(collection, case_id)")

    # ---- generic CRUD ----------------------------------------------------- #
    def put(self, collection: str, model) -> None:
        cls = MODELS[collection]
        data = model.model_dump(mode="json")
        case_id = data.get("case_id") or data.get("id")  # cases use their own id
        with self._lock, self._conn() as conn:
            if collection in _CASE_SCOPED and case_id:
                if conn.execute(
                    "SELECT 1 FROM kv WHERE collection='cases' AND id=?", (case_id,)
                ).fetchone() is None:
                    raise ValueError(f"FK violation: no case {case_id} for {collection}")
            conn.execute(
                "INSERT INTO kv(collection,id,case_id,payload) VALUES(?,?,?,?) "
                "ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload, case_id=excluded.case_id",
                (collection, data["id"], case_id, json.dumps(data)),
            )

    def get(self, collection: str, rec_id: str):
        cls = MODELS[collection]
        with self._lock, self._conn() as conn:
            row = conn.execute(
                "SELECT payload FROM kv WHERE collection=? AND id=?", (collection, rec_id)
            ).fetchone()
        return cls.model_validate(json.loads(row[0])) if row else None

    def list(self, collection: str, case_id: Optional[str] = None) -> list:
        cls = MODELS[collection]
        with self._lock, self._conn() as conn:
            if case_id:
                rows = conn.execute(
                    "SELECT payload FROM kv WHERE collection=? AND case_id=? ORDER BY id",
                    (collection, case_id),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload FROM kv WHERE collection=? ORDER BY id", (collection,)
                ).fetchall()
        return [cls.model_validate(json.loads(r[0])) for r in rows]

    def delete(self, collection: str, rec_id: str) -> bool:
        with self._lock, self._conn() as conn:
            cur = conn.execute("DELETE FROM kv WHERE collection=? AND id=?", (collection, rec_id))
            return cur.rowcount > 0

    def cascade_delete_case(self, case_id: str) -> int:
        """Delete a case and every scoped record for provenance-consistent removal."""
        removed = 0
        with self._lock, self._conn() as conn:
            for coll in _CASE_SCOPED:
                cur = conn.execute("DELETE FROM kv WHERE collection=? AND case_id=?", (coll, case_id))
                removed += cur.rowcount
            conn.execute("DELETE FROM kv WHERE collection='cases' AND id=?", (case_id,))
        return removed

    def clear_all(self) -> None:
        with self._lock, self._conn() as conn:
            conn.execute("DELETE FROM kv")


repo = Repository()
