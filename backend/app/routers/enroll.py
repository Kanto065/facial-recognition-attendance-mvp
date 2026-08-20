import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db.models import Person, PersonCategory, PersonFaceEmbedding
from app.db.session import get_db
from app.envelope import envelope
from app.recognition.matcher import enroll_face

router = APIRouter(prefix="/api", tags=["enroll"], dependencies=[Depends(require_admin)])


def _read_image(data: bytes) -> np.ndarray:
    array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return image


@router.post("/enroll")
async def enroll(
    fullName: str = Form(...),
    category: PersonCategory = Form(...),
    personTypeId: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    full_name = fullName.strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Name is required")

    data = await image.read()
    frame = _read_image(data)

    person = Person(
        full_name=full_name,
        category=category,
        person_type_id=int(personTypeId) if personTypeId else None,
    )
    db.add(person)
    db.flush()  # assign person.id without committing yet

    success, position = enroll_face(person.id, frame)
    if not success:
        db.rollback()
        raise HTTPException(status_code=422, detail="No face detected in the image")

    db.add(PersonFaceEmbedding(person_id=person.id, faiss_index_id=position))
    db.commit()

    return envelope({"id": str(person.id), "fullName": full_name}, message="Enrolled successfully")
