from collections.abc import Iterable
from typing import Optional

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole
from app.repositories import user_repo


def get_settings_dep() -> Settings:
    return get_settings()


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise UnauthorizedError("Missing Authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise UnauthorizedError("Malformed Authorization header")
    return parts[1]


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> User:
    token = _extract_bearer_token(authorization)
    try:
        payload = decode_token(token, settings)
    except ValueError as exc:
        raise UnauthorizedError("Invalid or expired token") from exc

    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Invalid token subject")

    user = user_repo.get_by_id(db, int(user_id))
    if not user or not user.is_active:
        raise UnauthorizedError("Account disabled")

    request.state.current_user_id = user.id
    return user


def require_roles(*roles: UserRole):
    allowed: Iterable[UserRole] = roles

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise ForbiddenError("Role not permitted")
        return user

    return _dep
