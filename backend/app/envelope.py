from typing import Any

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def envelope(data: Any = None, message: str = "OK", status_code: int = 200) -> dict:
    return {"success": True, "statusCode": status_code, "message": message, "data": data}


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "statusCode": exc.status_code, "message": str(exc.detail), "data": None},
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors: dict[str, list[str]] = {}
    for error in exc.errors():
        field = ".".join(str(part) for part in error["loc"][1:]) or "request"
        errors.setdefault(field, []).append(error["msg"])
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "statusCode": 422,
            "message": "Validation failed",
            "data": None,
            "errors": errors,
        },
    )
