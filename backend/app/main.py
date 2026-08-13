import logging
import os

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import AttendanceDB, FaceDatabase
from app.models import SCRFD, ArcFace

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
DATA_DIR = os.path.join(BASE_DIR, "data")
FRONTEND_DIST = os.path.join(PROJECT_ROOT, "frontend", "dist")
os.makedirs(DATA_DIR, exist_ok=True)

DET_WEIGHT = os.path.join(WEIGHTS_DIR, "det_500m.onnx")
REC_WEIGHT = os.path.join(WEIGHTS_DIR, "w600k_mbf.onnx")
FAISS_DB_PATH = os.path.join(DATA_DIR, "face_database")
SQLITE_DB_PATH = os.path.join(DATA_DIR, "attendance.sqlite3")

SIMILARITY_THRESH = 0.4
CONFIDENCE_THRESH = 0.5
ATTENDANCE_COOLDOWN_SECONDS = 300

app = FastAPI(title="Facial Recognition Attendance API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = SCRFD(DET_WEIGHT, input_size=(640, 640), conf_thres=CONFIDENCE_THRESH)
recognizer = ArcFace(REC_WEIGHT)

face_db = FaceDatabase(embedding_size=recognizer.embedding_size, db_path=FAISS_DB_PATH)
if not face_db.load():
    logger.info("No existing face database found, starting empty.")
    face_db.save()

attendance_db = AttendanceDB(SQLITE_DB_PATH)


def _read_image(data: bytes) -> np.ndarray:
    array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return image


@app.post("/enroll")
async def enroll(name: str = Form(...), image: UploadFile = File(...)):
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    data = await image.read()
    frame = _read_image(data)

    bboxes, kpss = detector.detect(frame, max_num=1)
    if kpss is None or len(kpss) == 0:
        raise HTTPException(status_code=422, detail="No face detected in the image")

    embedding = recognizer.get_embedding(frame, kpss[0])
    face_db.add_face(embedding, name)
    face_db.save()
    attendance_db.add_employee(name)

    return {"name": name, "enrolled": True}


@app.post("/recognize")
async def recognize(image: UploadFile = File(...)):
    data = await image.read()
    frame = _read_image(data)

    bboxes, kpss = detector.detect(frame, max_num=0)
    if bboxes is None or len(bboxes) == 0:
        return {"faces": []}

    embeddings = []
    boxes = []
    for bbox, kps in zip(bboxes, kpss):
        x1, y1, x2, y2 = bbox[:4].astype(int)
        embedding = recognizer.get_embedding(frame, kps)
        embeddings.append(embedding)
        boxes.append([int(x1), int(y1), int(x2 - x1), int(y2 - y1)])

    results = face_db.batch_search(embeddings, SIMILARITY_THRESH)

    faces = []
    for box, (name, similarity) in zip(boxes, results):
        matched = name != "Unknown"
        if matched:
            attendance_db.log_attendance(name, cooldown_seconds=ATTENDANCE_COOLDOWN_SECONDS)
        faces.append(
            {
                "box": box,
                "name": name,
                "confidence": round(float(similarity), 4),
                "matched": matched,
            }
        )

    return {"faces": faces}


@app.get("/employees")
async def list_employees():
    return {"employees": attendance_db.list_employees()}


@app.get("/health")
async def health():
    return {"status": "ok", "enrolled_faces": face_db.index.ntotal}


if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    logger.info(f"Serving frontend build from {FRONTEND_DIST}")
else:
    logger.warning(f"Frontend build not found at {FRONTEND_DIST} — run 'npm run build' in frontend/")
