from types import SimpleNamespace

import httpx
import pytest

from app.services import canva_service


def _settings(enabled: bool = True):
    return SimpleNamespace(
        canva_api_key="test-key" if enabled else "",
        canva_api_base_url="https://api.canva.test/rest",
        canva_enabled=enabled,
    )


def test_status_disabled_when_key_empty():
    assert canva_service.status(_settings(enabled=False)) == {
        "enabled": False,
        "base_url": None,
    }


def test_status_enabled_when_key_present():
    result = canva_service.status(_settings(enabled=True))
    assert result["enabled"] is True
    assert result["base_url"] == "https://api.canva.test/rest"


def test_export_raises_when_not_configured():
    with pytest.raises(canva_service.CanvaNotConfiguredError):
        canva_service.export_pdf_to_canva(b"%PDF-...", "file.pdf", _settings(enabled=False))


def test_export_happy_path(monkeypatch):
    settings = _settings(enabled=True)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path.endswith("/v1/asset-uploads"):
            assert request.headers["Authorization"] == "Bearer test-key"
            return httpx.Response(200, json={"job": {"id": "job-abc", "status": "in_progress"}})
        if request.method == "GET" and "/v1/asset-uploads/job-abc" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "job": {
                        "id": "job-abc",
                        "status": "success",
                        "asset": {"id": "asset-xyz", "name": "doe_q2_2026_sacs.pdf"},
                    }
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    def _fake_client(settings_arg):
        return httpx.Client(
            base_url=settings_arg.canva_api_base_url,
            headers={"Authorization": f"Bearer {settings_arg.canva_api_key}"},
            transport=transport,
        )

    monkeypatch.setattr(canva_service, "_client", _fake_client)
    monkeypatch.setattr(canva_service.time, "sleep", lambda _s: None)

    result = canva_service.export_pdf_to_canva(b"%PDF-1.7", "doe_q2_2026_sacs.pdf", settings)
    assert result["asset_id"] == "asset-xyz"
    assert result["edit_url"].endswith("/asset-xyz")
    assert result["name"] == "doe_q2_2026_sacs.pdf"


def test_export_propagates_canva_failure(monkeypatch):
    settings = _settings(enabled=True)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json={"job": {"id": "job-abc"}})
        return httpx.Response(
            200,
            json={
                "job": {
                    "id": "job-abc",
                    "status": "failed",
                    "error": {"message": "file too big"},
                }
            },
        )

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        canva_service,
        "_client",
        lambda s: httpx.Client(
            base_url=s.canva_api_base_url,
            headers={"Authorization": f"Bearer {s.canva_api_key}"},
            transport=transport,
        ),
    )
    monkeypatch.setattr(canva_service.time, "sleep", lambda _s: None)

    with pytest.raises(canva_service.CanvaExportError) as exc:
        canva_service.export_pdf_to_canva(b"%PDF-1.7", "x.pdf", settings)
    assert "file too big" in str(exc.value.detail)
