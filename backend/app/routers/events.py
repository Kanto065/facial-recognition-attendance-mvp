from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db.models import AccessEvent, Camera, Person, Zone
from app.db.session import get_db
from app.envelope import envelope

router = APIRouter(prefix="/api/events", tags=["events"], dependencies=[Depends(require_admin)])


@router.get("/recent")
def recent_events(limit: int = 50, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 200))
    rows = db.execute(
        select(AccessEvent, Person.full_name, Camera.name, Zone.name)
        .outerjoin(Person, Person.id == AccessEvent.person_id)
        .join(Camera, Camera.id == AccessEvent.camera_id)
        .join(Zone, Zone.id == AccessEvent.zone_id)
        .order_by(AccessEvent.occurred_at.desc())
        .limit(limit)
    ).all()

    events = [
        {
            "id": str(event.id),
            "personName": person_name,
            "cameraName": camera_name,
            "zoneName": zone_name,
            "accessLevel": event.access_level_at_time.value,
            "decision": event.decision.value,
            "confidence": event.confidence,
            "occurredAt": event.occurred_at.isoformat(),
        }
        for event, person_name, camera_name, zone_name in rows
    ]
    return envelope(events)
