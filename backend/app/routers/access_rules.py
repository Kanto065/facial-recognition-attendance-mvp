from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db.models import AccessLevel, Person, Zone, ZoneAccessRule
from app.db.session import get_db
from app.envelope import envelope

router = APIRouter(prefix="/api/access-rules", tags=["access-rules"], dependencies=[Depends(require_admin)])


class AccessRuleIn(BaseModel):
    personId: str
    zoneId: str
    accessLevel: AccessLevel
    validFrom: str | None = None
    validUntil: str | None = None


def _rule_out(r: ZoneAccessRule) -> dict:
    return {
        "id": str(r.id),
        "personId": str(r.person_id),
        "zoneId": str(r.zone_id),
        "accessLevel": r.access_level.value,
        "validFrom": r.valid_from.isoformat() if r.valid_from else None,
        "validUntil": r.valid_until.isoformat() if r.valid_until else None,
    }


@router.get("")
def list_access_rules(db: Session = Depends(get_db)):
    """Returns the full person x zone matrix: all active persons, all zones,
    and the access rules that exist between them (missing pairs default to
    'none' on the frontend)."""
    persons = db.scalars(select(Person).order_by(Person.full_name)).all()
    zones = db.scalars(select(Zone).order_by(Zone.name)).all()
    rules = db.scalars(select(ZoneAccessRule)).all()

    return envelope(
        {
            "persons": [{"id": str(p.id), "fullName": p.full_name} for p in persons],
            "zones": [{"id": str(z.id), "name": z.name} for z in zones],
            "rules": [_rule_out(r) for r in rules],
        }
    )


@router.put("")
def upsert_access_rule(payload: AccessRuleIn, db: Session = Depends(get_db)):
    person = db.get(Person, int(payload.personId))
    zone = db.get(Zone, int(payload.zoneId))
    if person is None or zone is None:
        raise HTTPException(status_code=400, detail="Person or zone not found")

    rule = db.scalar(
        select(ZoneAccessRule).where(
            ZoneAccessRule.person_id == person.id, ZoneAccessRule.zone_id == zone.id
        )
    )
    if rule is None:
        rule = ZoneAccessRule(person_id=person.id, zone_id=zone.id, access_level=payload.accessLevel)
        db.add(rule)
    else:
        rule.access_level = payload.accessLevel

    db.commit()
    db.refresh(rule)
    return envelope(_rule_out(rule), message="Access rule updated")
