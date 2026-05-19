from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict | None = None,
    ) -> None:
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message},
            headers=headers,
        )


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "not_found", message)


class ValidationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, "validation_error", message)


class ConflictError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(status.HTTP_409_CONFLICT, "conflict", message)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(
            status.HTTP_401_UNAUTHORIZED,
            "unauthorized",
            message,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(AppError):
    def __init__(self, message: str = "Insufficient permissions") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, "forbidden", message)
