from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.db.models import Person, PersonCategory, PersonStatus, PersonType
from app.db.session import get_db
from app.envelope import envelope

router = APIRouter(prefix="/api/persons", tags=["persons"], dependencies=[Depends(require_admin)])
types_router = APIRouter(prefix="/api/person-types", tags=["persons"], dependencies=[Depends(require_admin)])


class PersonUpdate(BaseModel):
    fullName: str
    category: PersonCategory
    personTypeId: str | None = None
    status: PersonStatus = PersonStatus.active


class PersonTypeIn(BaseModel):
    name: str
    category: PersonCategory


def _person_out(p: Person) -> dict:
    return {
        "id": str(p.id),
        "fullName": p.full_name,
        "category": p.category.value,
        "personTypeId": str(p.person_type_id) if p.person_type_id else None,
        "personTypeName": p.person_type.name if p.person_type else None,
        "status": p.status.value,
        "faceEnrolled": len(p.face_embeddings) > 0,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
    }


def _type_out(t: PersonType) -> dict:
    return {"id": str(t.id), "name": t.name, "category": t.category.value}


@router.get("")
def list_persons(db: Session = Depends(get_db)):
    persons = db.scalars(select(Person).order_by(Person.full_name)).all()
    return envelope([_person_out(p) for p in persons])


@router.put("/{person_id}")
def update_person(person_id: int, payload: PersonUpdate, db: Session = Depends(get_db)):
    person = db.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")

    person.full_name = payload.fullName
    person.category = payload.category
    person.person_type_id = int(payload.personTypeId) if payload.personTypeId else None
    person.status = payload.status
    db.commit()
    db.refresh(person)
    return envelope(_person_out(person), message="Person updated")


@router.delete("/{person_id}")
def deactivate_person(person_id: int, db: Session = Depends(get_db)):
    """Soft-delete: marks the person inactive rather than hard-deleting, since
    zone_access_rules/attendance/access events reference them by FK."""
    person = db.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")

    person.status = PersonStatus.inactive
    db.commit()
    return envelope(message="Person deactivated")


@types_router.get("")
def list_person_types(db: Session = Depends(get_db)):
    types = db.scalars(select(PersonType).order_by(PersonType.name)).all()
    return envelope([_type_out(t) for t in types])


@types_router.post("")
def create_person_type(payload: PersonTypeIn, db: Session = Depends(get_db)):
    if db.scalar(select(PersonType).where(PersonType.name == payload.name)):
        raise HTTPException(status_code=400, detail=f'Person type "{payload.name}" already exists')

    ptype = PersonType(name=payload.name, category=payload.category)
    db.add(ptype)
    db.commit()
    db.refresh(ptype)
    return envelope(_type_out(ptype), message="Person type created")
