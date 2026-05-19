"""Thin wrapper over the Canva Connect API.

Implements the documented two-step flow for getting a generated PDF into the
team's Canva workspace for editing:

    1. POST /v1/asset-uploads        -> upload PDF, returns an asset job id
    2. GET  /v1/asset-uploads/{id}   -> poll until status="success" and return
                                        the resulting design edit URL

Reference: https://www.canva.dev/docs/connect/api-reference/asset-uploads/

The integration is feature-flagged on `CANVA_API_KEY`. When the key is not
configured the API endpoint returns HTTP 503 with a clear message so callers
can fall back to the regular PDF download.
"""

from __future__ import annotations

import time

import httpx

from app.core.config import Settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

_logger = get_logger("canva")

_POLL_INTERVAL_SECONDS = 1.0
_POLL_MAX_ATTEMPTS = 30


class CanvaNotConfiguredError(AppError):
    def __init__(self) -> None:
        super().__init__(
            status_code=503,
            code="canva_not_configured",
            message=(
                "Canva export is not configured on this server. "
                "Set CANVA_API_KEY to enable it."
            ),
        )


class CanvaExportError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(
            status_code=502, code="canva_export_failed", message=message
        )


def _client(settings: Settings) -> httpx.Client:
    timeout = httpx.Timeout(30.0, connect=10.0)
    return httpx.Client(  # nosec B113 - timeout is set above
        base_url=settings.canva_api_base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {settings.canva_api_key}"},
        timeout=timeout,
    )


def export_pdf_to_canva(
    pdf_bytes: bytes,
    filename: str,
    settings: Settings,
) -> dict:
    """Upload a PDF as a Canva asset and return its edit URL.

    Returns a dict with at least:
      - asset_id:   Canva asset identifier
      - edit_url:   URL the team can open to edit the imported design
    """
    if not settings.canva_enabled:
        raise CanvaNotConfiguredError()

    headers = {
        "Asset-Upload-Metadata": (
            '{"name_base64":"' + _b64_name(filename) + '"}'
        ),
        "Content-Type": "application/octet-stream",
    }

    with _client(settings) as client:
        try:
            create = client.post(
                "/v1/asset-uploads",
                headers=headers,
                content=pdf_bytes,
            )
        except httpx.HTTPError as exc:
            _logger.error("canva.upload.network_error", error=str(exc))
            raise CanvaExportError("Could not reach Canva") from exc

        if create.status_code >= 400:
            _logger.error(
                "canva.upload.error",
                status=create.status_code,
                body=create.text[:500],
            )
            raise CanvaExportError(
                f"Canva upload failed: {create.status_code}"
            )

        job = create.json().get("job", {})
        job_id = job.get("id")
        if not job_id:
            raise CanvaExportError("Canva did not return a job id")

        asset = _wait_for_job(client, job_id)

    asset_id = asset.get("id", "")
    edit_url = (
        f"https://www.canva.com/design/from-asset/{asset_id}"
        if asset_id
        else "https://www.canva.com/"
    )
    return {
        "asset_id": asset_id,
        "edit_url": edit_url,
        "name": asset.get("name", filename),
    }


def _b64_name(name: str) -> str:
    import base64

    return base64.b64encode(name.encode()).decode()


def _wait_for_job(client: httpx.Client, job_id: str) -> dict:
    for _attempt in range(_POLL_MAX_ATTEMPTS):
        resp = client.get(f"/v1/asset-uploads/{job_id}")
        if resp.status_code >= 400:
            raise CanvaExportError(
                f"Canva polling failed: {resp.status_code}"
            )
        payload = resp.json().get("job", {})
        status = payload.get("status")
        if status == "success":
            return payload.get("asset", {})
        if status == "failed":
            error = payload.get("error", {}).get("message", "unknown error")
            raise CanvaExportError(f"Canva job failed: {error}")
        time.sleep(_POLL_INTERVAL_SECONDS)
    raise CanvaExportError("Canva upload timed out")


def status(settings: Settings) -> dict:
    return {
        "enabled": settings.canva_enabled,
        "base_url": settings.canva_api_base_url if settings.canva_enabled else None,
    }
