"""
Single-owner wrapper around FaceDatabase (FAISS). Only this module should
touch app.database.faiss_db directly — every other part of the app (routers,
future ingestion workers) goes through the functions here, so there is
exactly one process/module mutating the on-disk index and no risk of
concurrent-write corruption.
"""

import logging
import os

import numpy as np

from app.config import settings
from app.database import FaceDatabase
from app.models import SCRFD, ArcFace

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DET_WEIGHT = os.path.join(WEIGHTS_DIR, "det_500m.onnx")
REC_WEIGHT = os.path.join(WEIGHTS_DIR, "w600k_mbf.onnx")
FAISS_DB_PATH = os.path.join(DATA_DIR, "face_database")

detector = SCRFD(DET_WEIGHT, input_size=(640, 640), conf_thres=settings.detection_confidence_threshold)
recognizer = ArcFace(REC_WEIGHT)

face_db = FaceDatabase(embedding_size=recognizer.embedding_size, db_path=FAISS_DB_PATH)
if not face_db.load():
    logger.info("No existing face database found, starting empty.")
    face_db.save()


def enroll_face(person_id: int, frame: np.ndarray) -> tuple[bool, int]:
    """Detect exactly one face in `frame` and add its embedding under label
    str(person_id). Returns (success, faiss_position_at_insert)."""
    bboxes, kpss = detector.detect(frame, max_num=1)
    if kpss is None or len(kpss) == 0:
        return False, -1

    embedding = recognizer.get_embedding(frame, kpss[0])
    position = face_db.index.ntotal
    face_db.add_face(embedding, str(person_id))
    face_db.save()
    return True, position


def remove_person_faces(person_id: int) -> int:
    removed = face_db.remove_by_name(str(person_id))
    if removed:
        face_db.save()
    return removed


def recognize_faces(frame: np.ndarray) -> list[dict]:
    """Detect and match every face in `frame`. Returns a list of
    {box, person_id, confidence, matched} dicts."""
    bboxes, kpss = detector.detect(frame, max_num=0)
    if bboxes is None or len(bboxes) == 0:
        return []

    embeddings = []
    boxes = []
    for bbox, kps in zip(bboxes, kpss):
        x1, y1, x2, y2 = bbox[:4].astype(int)
        embeddings.append(recognizer.get_embedding(frame, kps))
        boxes.append([int(x1), int(y1), int(x2 - x1), int(y2 - y1)])

    results = face_db.batch_search(embeddings, settings.similarity_threshold)

    faces = []
    for box, (label, similarity) in zip(boxes, results):
        matched = label != "Unknown"
        faces.append(
            {
                "box": box,
                "person_id": int(label) if matched else None,
                "confidence": round(float(similarity), 4),
                "matched": matched,
            }
        )
    return faces
