"""Small request-scoped helpers shared across API routes."""

from __future__ import annotations

from starlette.requests import Request


def client_ip(request: Request) -> str:
    """Return the originating client IP, honouring `X-Forwarded-For`."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""
