from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CASEWEAVER_", env_file=".env", extra="ignore")

    # Vercel Functions expose only /tmp as writable storage. These files are
    # intentionally ephemeral there; production deployments should use managed
    # database and object-storage services instead.
    db_path: Path = Path("/tmp/caseweaver.db") if os.getenv("VERCEL") else Path("./caseweaver.db")
    storage_dir: Path = Path("/tmp/caseweaver-storage") if os.getenv("VERCEL") else Path("./storage")
    max_upload_bytes: int = 8 * 1024 * 1024
    allowed_extensions: set[str] = {
        "png", "jpg", "jpeg", "pdf", "txt", "csv", "json", "eml",
    }
    mode: str = "demo"  # demo | local | live

    # Live integrations (empty by default -> demo mode is fully functional)
    openai_api_key: str = ""
    searchapi_api_key: str = ""

    @property
    def llm_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def search_configured(self) -> bool:
        return bool(self.searchapi_api_key)


settings = Settings()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
