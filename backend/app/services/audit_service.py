from typing import Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def record(
    db: Session,
    action: str,
    actor_user_id: Optional[int] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        ip_address=ip_address,
        metadata_json=metadata or {},
    )
    db.add(entry)
    db.commit()
    return entry
