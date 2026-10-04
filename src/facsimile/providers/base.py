from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LiveNewsItem(BaseModel):
    provider: str
    title: str
    url: str | None = None
    publisher: str | None = None
    published_at: datetime | None = None
    summary: str | None = None


class ProviderStatus(BaseModel):
    provider: str
    configured: bool = True
    available: bool = True
    capabilities: list[str] = Field(default_factory=list)
    detail: str | None = None
