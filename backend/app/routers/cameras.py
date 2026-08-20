from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.config import settings
from app.db.models import (
    AccessDecision,
    AccessEvent,
    AccessLevel,
    AttendanceEvent,
    Camera,
    CameraSourceType,
    Person,
    PersonStatus,
    Zone,
)
from app.db.session import get_db
from app.envelope import envelope
from app.recognition.access_decision import decide_access
from app.recognition.matcher import recognize_faces

router = APIRouter(prefix="/api/cameras", tags=["cameras"], dependencies=[Depends(require_admin)])


class CameraIn(BaseModel):
    zoneId: str
    name: str
    sourceType: CameraSourceType = CameraSourceType.rtsp
    rtspUrl: str | None = None
    enabled: bool = True
    samplingFps: float = 1.5


def _camera_out(c: Camera) -> dict:
    return {
        "id": str(c.id),
        "zoneId": str(c.zone_id),
        "zoneName": c.zone.name if c.zone else None,
        "name": c.name,
        "sourceType": c.source_type.value,
        "rtspUrl": c.rtsp_url,
        "enabled": c.enabled,
        "samplingFps": c.sampling_fps,
    }


def _validate_rtsp(payload: CameraIn) -> None:
    if payload.sourceType == CameraSourceType.rtsp and not (payload.rtspUrl and payload.rtspUrl.strip()):
        raise HTTPException(status_code=400, detail="RTSP URL is required for RTSP cameras")


@router.get("")
def list_cameras(db: Session = Depends(get_db)):
    cameras = db.scalars(select(Camera).order_by(Camera.name)).all()
    return envelope([_camera_out(c) for c in cameras])


@router.post("")
def create_camera(payload: CameraIn, db: Session = Depends(get_db)):
    _validate_rtsp(payload)
    zone = db.get(Zone, int(payload.zoneId))
    if zone is None:
        raise HTTPException(status_code=400, detail="Zone not found")

    camera = Camera(
        zone_id=zone.id,
        name=payload.name,
        source_type=payload.sourceType,
        rtsp_url=payload.rtspUrl if payload.sourceType == CameraSourceType.rtsp else None,
        enabled=payload.enabled,
        sampling_fps=payload.samplingFps,
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return envelope(_camera_out(camera), message="Camera created")


@router.put("/{camera_id}")
def update_camera(camera_id: int, payload: CameraIn, db: Session = Depends(get_db)):
    _validate_rtsp(payload)
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    zone = db.get(Zone, int(payload.zoneId))
    if zone is None:
        raise HTTPException(status_code=400, detail="Zone not found")

    camera.zone_id = zone.id
    camera.name = payload.name
    camera.source_type = payload.sourceType
    camera.rtsp_url = payload.rtspUrl if payload.sourceType == CameraSourceType.rtsp else None
    camera.enabled = payload.enabled
    camera.sampling_fps = payload.samplingFps
    db.commit()
    db.refresh(camera)
    return envelope(_camera_out(camera), message="Camera updated")


@router.delete("/{camera_id}")
def delete_camera(camera_id: int, db: Session = Depends(get_db)):
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    db.delete(camera)
    db.commit()
    return envelope(message="Camera deleted")


def _read_image(data: bytes) -> np.ndarray:
    array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return image


@router.post("/{camera_id}/recognize")
async def recognize_on_camera(camera_id: int, image: UploadFile = File(...), db: Session = Depends(get_db)):
    """Browser-sourced recognition: a device streaming its own webcam as
    `camera_id` posts a frame here. Detects+matches faces, applies the
    camera's zone access rules, logs attendance/access events (subject to a
    per-person cooldown so walking-around doesn't spam the log), and returns
    per-face results so the sending device can render its own overlay."""
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not camera.enabled:
        raise HTTPException(status_code=400, detail="Camera is disabled")

    data = await image.read()
    frame = _read_image(data)
    detected = recognize_faces(frame)

    cooldown = timedelta(seconds=settings.attendance_cooldown_seconds)
    now = datetime.now(timezone.utc)

    faces = []
    for face in detected:
        person_id = face["person_id"]
        result = {
            "box": face["box"],
            "matched": face["matched"],
            "confidence": face["confidence"],
            "personId": None,
            "fullName": None,
            "accessLevel": None,
            "decision": None,
            "logged": False,
        }

        if person_id is not None:
            person = db.get(Person, person_id)
            if person is not None:
                if person.status == PersonStatus.active:
                    access_level, decision = decide_access(db, person_id, camera.zone_id)
                else:
                    # Deactivated persons are always denied, regardless of any
                    # zone_access_rule left over from when they were active.
                    access_level, decision = AccessLevel.none, AccessDecision.denied
                result.update(
                    {
                        "personId": str(person.id),
                        "fullName": person.full_name,
                        "accessLevel": access_level.value,
                        "decision": decision.value,
                    }
                )

                last = db.scalar(
                    select(AttendanceEvent)
                    .where(AttendanceEvent.person_id == person.id)
                    .order_by(AttendanceEvent.occurred_at.desc())
                )
                # naive DB datetimes are compared as UTC-implicit here (server_default now() is UTC)
                if last is None or (now - last.occurred_at.replace(tzinfo=timezone.utc)) > cooldown:
                    db.add(
                        AttendanceEvent(
                            person_id=person.id,
                            camera_id=camera.id,
                            zone_id=camera.zone_id,
                            confidence=face["confidence"],
                        )
                    )
                    db.add(
                        AccessEvent(
                            person_id=person.id,
                            camera_id=camera.id,
                            zone_id=camera.zone_id,
                            access_level_at_time=access_level,
                            decision=decision,
                            confidence=face["confidence"],
                        )
                    )
                    db.commit()
                    result["logged"] = True

        faces.append(result)

    return envelope({"faces": faces})
