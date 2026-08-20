import logging
import mimetypes
import os

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.envelope import http_exception_handler, validation_exception_handler
from app.recognition import matcher  # also loads models + FAISS index at import time
from app.routers import access_rules, auth, cameras, enroll, persons, zones

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Windows' registry-backed mimetypes DB is frequently misconfigured to serve
# .js as text/plain, which browsers reject for ES module scripts.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
FRONTEND_DIST = os.path.join(PROJECT_ROOT, "frontend", "dist")

app = FastAPI(title="Warehouse Facial Recognition Attendance & Access Control API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=False,  # bearer-token auth, not cookies — no credentials needed
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)

app.include_router(auth.router)
app.include_router(persons.router)
app.include_router(persons.types_router)
app.include_router(zones.router)
app.include_router(cameras.router)
app.include_router(access_rules.router)
app.include_router(enroll.router)


@app.get("/health")
async def health():
    return {"status": "ok", "enrolled_faces": matcher.face_db.index.ntotal}


if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    logger.info(f"Serving frontend build from {FRONTEND_DIST}")
else:
    logger.warning(f"Frontend build not found at {FRONTEND_DIST} — run 'npm run build' in frontend/")
