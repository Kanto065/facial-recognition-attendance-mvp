from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db.models import Camera, Zone
from app.db.session import get_db
from app.envelope import envelope

router = APIRouter(prefix="/api/cameras", tags=["cameras"], dependencies=[Depends(require_admin)])


class CameraIn(BaseModel):
    zoneId: str
    name: str
    rtspUrl: str
    enabled: bool = True
    samplingFps: float = 1.5


def _camera_out(c: Camera) -> dict:
    return {
        "id": str(c.id),
        "zoneId": str(c.zone_id),
        "zoneName": c.zone.name if c.zone else None,
        "name": c.name,
        "rtspUrl": c.rtsp_url,
        "enabled": c.enabled,
        "samplingFps": c.sampling_fps,
    }


@router.get("")
def list_cameras(db: Session = Depends(get_db)):
    cameras = db.scalars(select(Camera).order_by(Camera.name)).all()
    return envelope([_camera_out(c) for c in cameras])


@router.post("")
def create_camera(payload: CameraIn, db: Session = Depends(get_db)):
    zone = db.get(Zone, int(payload.zoneId))
    if zone is None:
        raise HTTPException(status_code=400, detail="Zone not found")

    camera = Camera(
        zone_id=zone.id,
        name=payload.name,
        rtsp_url=payload.rtspUrl,
        enabled=payload.enabled,
        sampling_fps=payload.samplingFps,
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return envelope(_camera_out(camera), message="Camera created")


@router.put("/{camera_id}")
def update_camera(camera_id: int, payload: CameraIn, db: Session = Depends(get_db)):
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    zone = db.get(Zone, int(payload.zoneId))
    if zone is None:
        raise HTTPException(status_code=400, detail="Zone not found")

    camera.zone_id = zone.id
    camera.name = payload.name
    camera.rtsp_url = payload.rtspUrl
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
