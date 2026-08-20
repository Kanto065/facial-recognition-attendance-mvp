from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db.models import Zone
from app.db.session import get_db
from app.envelope import envelope

router = APIRouter(prefix="/api/zones", tags=["zones"], dependencies=[Depends(require_admin)])


class ZoneIn(BaseModel):
    name: str
    description: str | None = None
    zoneType: str = "general"


def _zone_out(z: Zone) -> dict:
    return {
        "id": str(z.id),
        "name": z.name,
        "description": z.description,
        "zoneType": z.zone_type,
        "cameraCount": len(z.cameras),
    }


@router.get("")
def list_zones(db: Session = Depends(get_db)):
    zones = db.scalars(select(Zone).order_by(Zone.name)).all()
    return envelope([_zone_out(z) for z in zones])


@router.post("")
def create_zone(payload: ZoneIn, db: Session = Depends(get_db)):
    if db.scalar(select(Zone).where(Zone.name == payload.name)):
        raise HTTPException(status_code=400, detail=f'Zone "{payload.name}" already exists')

    zone = Zone(name=payload.name, description=payload.description, zone_type=payload.zoneType)
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return envelope(_zone_out(zone), message="Zone created")


@router.put("/{zone_id}")
def update_zone(zone_id: int, payload: ZoneIn, db: Session = Depends(get_db)):
    zone = db.get(Zone, zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail="Zone not found")

    zone.name = payload.name
    zone.description = payload.description
    zone.zone_type = payload.zoneType
    db.commit()
    db.refresh(zone)
    return envelope(_zone_out(zone), message="Zone updated")


@router.delete("/{zone_id}")
def delete_zone(zone_id: int, db: Session = Depends(get_db)):
    zone = db.get(Zone, zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail="Zone not found")

    db.delete(zone)
    db.commit()
    return envelope(message="Zone deleted")
