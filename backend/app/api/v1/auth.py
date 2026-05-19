from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_settings_dep
from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.core.rate_limit import limiter
from app.core.request_utils import client_ip
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserPublic
from app.services import audit_service, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "aw_refresh_token"


def _set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.jwt_refresh_token_ttl_days * 24 * 60 * 60,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/v1/auth")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/15minutes")
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> TokenResponse:
    ip = client_ip(request)
    try:
        user = auth_service.authenticate(db, payload.email, payload.password)
    except UnauthorizedError:
        audit_service.record(
            db,
            action="auth.login.failure",
            ip_address=ip,
            metadata={"email": payload.email},
        )
        raise

    access, refresh = auth_service.issue_tokens(user, settings)
    _set_refresh_cookie(response, refresh, settings)
    audit_service.record(
        db,
        action="auth.login.success",
        actor_user_id=user.id,
        ip_address=ip,
    )
    return TokenResponse(
        access_token=access,
        expires_in=settings.jwt_access_token_ttl_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> TokenResponse:
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise UnauthorizedError("Missing refresh token")
    user, access = auth_service.refresh_access_token(db, refresh_token, settings)
    return TokenResponse(
        access_token=access,
        expires_in=settings.jwt_access_token_ttl_minutes * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Response:
    user_id = getattr(request.state, "current_user_id", None)
    if user_id:
        audit_service.record(
            db,
            action="auth.logout",
            actor_user_id=user_id,
            ip_address=client_ip(request),
        )
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(user)
