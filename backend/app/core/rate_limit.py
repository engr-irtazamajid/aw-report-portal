from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings


def _key_func(request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=_key_func,
    default_limits=[get_settings().rate_limit_default],
)
