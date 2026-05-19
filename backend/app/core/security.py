import base64
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import Settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _pwd_context.verify(plain, hashed)
    except ValueError:
        return False


def _derive_fernet_key(settings: Settings) -> bytes:
    raw = settings.fernet_key.strip()
    if raw:
        try:
            Fernet(raw.encode())
            return raw.encode()
        except (ValueError, TypeError):
            pass
    digest = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet(settings: Settings) -> Fernet:
    return Fernet(_derive_fernet_key(settings))


def encrypt_value(plain: str, settings: Settings) -> str:
    if plain is None or plain == "":
        return ""
    return get_fernet(settings).encrypt(plain.encode()).decode()


def decrypt_value(token: str, settings: Settings) -> str:
    if not token:
        return ""
    try:
        return get_fernet(settings).decrypt(token.encode()).decode()
    except InvalidToken:
        return ""


def create_access_token(subject: str, role: str, settings: Settings) -> str:
    expires = datetime.now(UTC) + timedelta(
        minutes=settings.jwt_access_token_ttl_minutes
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": "access",
        "exp": expires,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, settings: Settings) -> str:
    expires = datetime.now(UTC) + timedelta(
        days=settings.jwt_refresh_token_ttl_days
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "type": "refresh",
        "exp": expires,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        return jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as exc:
        raise ValueError("invalid_token") from exc


def mask_ssn_last4(value: str) -> str:
    """Format the stored "last 4 of SSN" for display.

    The DB only ever stores the last 4 digits, so we prefix with five
    asterisks (one per redacted digit of the original 9-digit SSN) and
    show the 4 stored digits. Returns an empty string when the value is
    missing.
    """
    if not value:
        return ""
    digits = value.strip()[-4:]
    if not digits:
        return ""
    return f"*****{digits}"
