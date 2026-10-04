from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx
from pydantic import BaseModel, Field


class CatalystEvidence(BaseModel):
    source: str
    kind: str
    title: str
    score: float = Field(ge=0, le=100)
    event_date: datetime | None = None
    status: str | None = None
    phase: str | None = None
    url: str = ""
    summary: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


def _parse_date(value: Any) -> datetime | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for candidate in (text, text + "-01", text + "-01-01"):
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _company_query_name(company: str) -> str:
    cleaned = re.sub(
        r"\b(incorporated|inc|corp|corporation|plc|ltd|limited|holdings|holding|group)\b\.?",
        "",
        company,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"[,()]", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


class ClinicalTrialsProvider:
    name = "ClinicalTrials.gov"
    url = "https://clinicaltrials.gov/api/v2/studies"

    def evidence_for_company(
        self,
        company: str,
        limit: int = 10,
    ) -> list[CatalystEvidence]:
        query = _company_query_name(company)
        if len(query) < 3:
            return []

        response = httpx.get(
            self.url,
            params={
                "query.spons": query,
                "format": "json",
                "pageSize": min(max(limit, 1), 25),
                "sort": "LastUpdatePostDate:desc",
            },
            timeout=20,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json()
        studies = payload.get("studies", []) if isinstance(payload, dict) else []
        now = datetime.now(timezone.utc)
        evidence: list[CatalystEvidence] = []

        for study in studies:
            protocol = study.get("protocolSection", {})
            identification = protocol.get("identificationModule", {})
            status_module = protocol.get("statusModule", {})
            design = protocol.get("designModule", {})
            sponsor_module = protocol.get("sponsorCollaboratorsModule", {})

            nct_id = str(identification.get("nctId") or "").strip()
            title = str(identification.get("briefTitle") or nct_id or "Clinical trial")
            overall_status = str(status_module.get("overallStatus") or "").replace("_", " ").title()
            phases = design.get("phases") or []
            phase = ", ".join(str(item).replace("_", " ").title() for item in phases) or None

            primary_struct = status_module.get("primaryCompletionDateStruct") or {}
            completion_struct = status_module.get("completionDateStruct") or {}
            update_struct = status_module.get("lastUpdatePostDateStruct") or {}
            primary_date = _parse_date(primary_struct.get("date"))
            completion_date = _parse_date(completion_struct.get("date"))
            update_date = _parse_date(update_struct.get("date"))
            event_date = primary_date or completion_date or update_date

            sponsor = (
                (sponsor_module.get("leadSponsor") or {}).get("name")
                or query
            )

            score = 35.0
            phase_text = (phase or "").lower()
            if "phase 3" in phase_text:
                score += 25
            elif "phase 2" in phase_text:
                score += 18
            elif "phase 1" in phase_text:
                score += 10

            days = None
            if event_date is not None:
                days = (event_date - now).total_seconds() / 86400
                if -30 <= days <= 60:
                    score += 25
                elif -90 <= days <= 120:
                    score += 15
                elif abs(days) <= 365:
                    score += 5

            if overall_status.lower() in {
                "recruiting",
                "active not recruiting",
                "completed",
            }:
                score += 5

            date_label = (
                event_date.date().isoformat()
                if event_date is not None
                else "date unavailable"
            )
            summary = (
                f"{sponsor}; {overall_status or 'status unavailable'}; "
                f"{phase or 'phase unavailable'}; key registry date {date_label}."
            )
            evidence.append(
                CatalystEvidence(
                    source=self.name,
                    kind="clinical_trial",
                    title=title,
                    score=min(100, score),
                    event_date=event_date,
                    status=overall_status or None,
                    phase=phase,
                    url=(
                        f"https://clinicaltrials.gov/study/{nct_id}"
                        if nct_id
                        else ""
                    ),
                    summary=summary,
                    metadata={
                        "nct_id": nct_id,
                        "query_sponsor": query,
                        "lead_sponsor": sponsor,
                        "days_to_event": days,
                    },
                )
            )

        return sorted(
            evidence,
            key=lambda item: (
                item.score,
                item.event_date or datetime.min.replace(tzinfo=timezone.utc),
            ),
            reverse=True,
        )


class OpenFdaDrugsProvider:
    name = "openFDA Drugs@FDA"
    url = "https://api.fda.gov/drug/drugsfda.json"

    def evidence_for_company(
        self,
        company: str,
        limit: int = 8,
    ) -> list[CatalystEvidence]:
        query = _company_query_name(company)
        if len(query) < 3:
            return []

        try:
            response = httpx.get(
                self.url,
                params={
                    "search": f'sponsor_name:"{query}"',
                    "limit": min(max(limit, 1), 20),
                },
                timeout=20,
                follow_redirects=True,
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return []
            raise

        payload = response.json()
        results = payload.get("results", []) if isinstance(payload, dict) else []
        evidence: list[CatalystEvidence] = []
        now = datetime.now(timezone.utc)

        for record in results:
            application = str(record.get("application_number") or "")
            sponsor = str(record.get("sponsor_name") or query)
            products = record.get("products") or []
            drug_names = [
                str(product.get("brand_name") or product.get("active_ingredients") or "")
                for product in products
                if isinstance(product, dict)
            ]
            submissions = record.get("submissions") or []

            for submission in submissions[:5]:
                if not isinstance(submission, dict):
                    continue
                status_date = _parse_date(submission.get("submission_status_date"))
                status = str(submission.get("submission_status") or "")
                submission_type = str(submission.get("submission_type") or "")
                submission_number = str(submission.get("submission_number") or "")
                if status_date is None:
                    continue

                age_days = max(0.0, (now - status_date).total_seconds() / 86400)
                score = 30.0
                if age_days <= 30:
                    score += 35
                elif age_days <= 90:
                    score += 25
                elif age_days <= 365:
                    score += 10
                if status.upper() in {"AP", "TA"}:
                    score += 15

                label = ", ".join(name for name in drug_names if name) or application
                evidence.append(
                    CatalystEvidence(
                        source=self.name,
                        kind="fda_submission",
                        title=f"{label}: FDA submission {submission_type} {submission_number}".strip(),
                        score=min(100, score),
                        event_date=status_date,
                        status=status or None,
                        url="https://www.accessdata.fda.gov/scripts/cder/daf/",
                        summary=(
                            f"Sponsor {sponsor}; application {application}; "
                            f"submission status {status or 'unknown'}."
                        ),
                        metadata={
                            "application_number": application,
                            "sponsor_name": sponsor,
                            "submission_type": submission_type,
                            "submission_number": submission_number,
                        },
                    )
                )

        return sorted(
            evidence,
            key=lambda item: (
                item.score,
                item.event_date or datetime.min.replace(tzinfo=timezone.utc),
            ),
            reverse=True,
        )[:limit]


class StructuredCatalystService:
    def __init__(self) -> None:
        self.clinical_trials = ClinicalTrialsProvider()
        self.open_fda = OpenFdaDrugsProvider()

    def evidence_for_company(
        self,
        company: str,
    ) -> tuple[list[CatalystEvidence], list[str]]:
        evidence: list[CatalystEvidence] = []
        warnings: list[str] = []

        for provider in (self.clinical_trials, self.open_fda):
            try:
                evidence.extend(provider.evidence_for_company(company))
            except Exception as exc:
                warnings.append(f"{provider.name}: {exc}")

        deduped: dict[tuple[str, str, str], CatalystEvidence] = {}
        for item in evidence:
            key = (
                item.source,
                item.kind,
                item.title.lower(),
            )
            existing = deduped.get(key)
            if existing is None or item.score > existing.score:
                deduped[key] = item

        ordered = sorted(
            deduped.values(),
            key=lambda item: (
                item.score,
                item.event_date or datetime.min.replace(tzinfo=timezone.utc),
            ),
            reverse=True,
        )
        return ordered[:12], warnings


def structured_catalyst_score(
    evidence: list[CatalystEvidence],
) -> float:
    if not evidence:
        return 0.0
    top = evidence[:3]
    weights = (1.0, 0.45, 0.25)
    numerator = sum(item.score * weights[index] for index, item in enumerate(top))
    denominator = sum(weights[: len(top)])
    return round(min(100.0, numerator / denominator), 1)
