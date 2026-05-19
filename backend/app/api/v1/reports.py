from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_settings_dep, require_roles
from app.core.config import Settings
from app.core.request_utils import client_ip
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.report import (
    ReportCreate,
    ReportFinalize,
    ReportRead,
    ReportSummary,
)
from app.services import (
    audit_service,
    canva_service,
    client_service,
    pdf_service,
    report_service,
)

router = APIRouter(tags=["reports"])


@router.post(
    "/clients/{client_id}/reports",
    response_model=ReportRead,
    status_code=status.HTTP_201_CREATED,
)
def create_report(
    client_id: int,
    payload: ReportCreate,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.ASSISTANT)),
) -> ReportRead:
    client = client_service.get_client_or_404(db, client_id)
    report = report_service.create_draft(
        db, client, payload.period_label, payload.balances, user.id
    )
    audit_service.record(
        db,
        action="report.draft.create",
        actor_user_id=user.id,
        target_type="report",
        target_id=report.id,
        ip_address=client_ip(request),
        metadata={"client_id": client.id, "period": payload.period_label},
    )
    return report_service.to_read(report)


@router.get("/clients/{client_id}/reports", response_model=list[ReportSummary])
def list_reports_for_client(
    client_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ReportSummary]:
    client_service.get_client_or_404(db, client_id)
    return report_service.list_for_client(db, client_id)


@router.get("/reports/{report_id}", response_model=ReportRead)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ReportRead:
    report = report_service.get_or_404(db, report_id)
    return report_service.to_read(report)


@router.post("/reports/{report_id}/finalize", response_model=ReportRead)
def finalize_report(
    report_id: int,
    payload: ReportFinalize,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.ASSISTANT)),
) -> ReportRead:
    report = report_service.get_or_404(db, report_id)
    client = client_service.get_client_or_404(db, report.client_id)
    report = report_service.finalize(db, report, client, payload.balances)
    pdf_service.get_or_create_pdf(settings, client, report, "sacs", force=True)
    pdf_service.get_or_create_pdf(settings, client, report, "tcc", force=True)
    audit_service.record(
        db,
        action="report.finalize",
        actor_user_id=user.id,
        target_type="report",
        target_id=report.id,
        ip_address=client_ip(request),
    )
    return report_service.to_read(report)


@router.get("/reports/{report_id}/pdf")
def get_report_pdf(
    report_id: int,
    request: Request,
    type: Literal["sacs", "tcc"] = Query(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    user: User = Depends(get_current_user),
):
    report = report_service.get_or_404(db, report_id)
    client = client_service.get_client_or_404(db, report.client_id)
    path = pdf_service.get_or_create_pdf(settings, client, report, type, force=False)
    audit_service.record(
        db,
        action="report.pdf.download",
        actor_user_id=user.id,
        target_type="report",
        target_id=report.id,
        ip_address=client_ip(request),
        metadata={"type": type},
    )
    period_slug = report.period_label.replace(" ", "_").lower()
    filename = f"{client.primary_last_name.lower()}_{period_slug}_{type}.pdf"

    def _iter():
        with open(path, "rb") as fh:
            while chunk := fh.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        _iter(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/integrations/canva/status")
def canva_status(
    settings: Settings = Depends(get_settings_dep),
    _: User = Depends(get_current_user),
) -> dict:
    return canva_service.status(settings)


@router.post("/reports/{report_id}/export/canva")
def export_report_to_canva(
    report_id: int,
    request: Request,
    type: Literal["sacs", "tcc"] = Query(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.ASSISTANT)),
) -> dict:
    report = report_service.get_or_404(db, report_id)
    client = client_service.get_client_or_404(db, report.client_id)
    path = pdf_service.get_or_create_pdf(settings, client, report, type, force=False)
    pdf_bytes = path.read_bytes()
    filename = (
        f"{client.primary_last_name.lower()}_"
        f"{report.period_label.replace(' ', '_').lower()}_{type}.pdf"
    )
    result = canva_service.export_pdf_to_canva(pdf_bytes, filename, settings)
    audit_service.record(
        db,
        action="report.canva.export",
        actor_user_id=user.id,
        target_type="report",
        target_id=report.id,
        ip_address=client_ip(request),
        metadata={"type": type, "asset_id": result.get("asset_id")},
    )
    return result
