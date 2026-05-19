from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIdMiddleware, SecurityHeadersMiddleware
from app.core.rate_limit import limiter
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.services.auth_service import ensure_seed_admin

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger("app")


@asynccontextmanager
async def _lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_seed_admin(db, settings)
    logger.info("app.started", env=settings.app_env)
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        docs_url="/api/docs" if not settings.is_production else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if not settings.is_production else None,
        lifespan=_lifespan,
    )

    application.state.limiter = limiter
    application.add_middleware(SlowAPIMiddleware)
    application.add_middleware(RequestIdMiddleware)
    application.add_middleware(SecurityHeadersMiddleware, production=settings.is_production)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
        expose_headers=["X-Request-Id"],
        max_age=86400,
    )

    @application.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": "Request payload failed validation",
                    "errors": exc.errors(),
                }
            },
        )

    @application.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": {
                    "code": "rate_limited",
                    "message": f"Rate limit exceeded: {exc.detail}",
                }
            },
        )

    @application.get("/api/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok", "service": settings.app_name}

    application.include_router(api_router)
    return application


app = create_app()
