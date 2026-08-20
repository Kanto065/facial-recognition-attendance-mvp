import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class PersonCategory(str, enum.Enum):
    internal = "internal"
    external = "external"


class PersonStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class AccessLevel(str, enum.Enum):
    full = "full"
    partial = "partial"
    none = "none"


class AccessDecision(str, enum.Enum):
    allowed = "allowed"
    flagged = "flagged"
    denied = "denied"


class CameraSourceType(str, enum.Enum):
    rtsp = "rtsp"
    browser = "browser"


class PersonType(Base):
    __tablename__ = "person_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    category: Mapped[PersonCategory] = mapped_column(Enum(PersonCategory, name="person_type_category"), nullable=False)

    persons: Mapped[list["Person"]] = relationship(back_populates="person_type")


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[PersonCategory] = mapped_column(Enum(PersonCategory, name="person_category"), nullable=False)
    person_type_id: Mapped[int | None] = mapped_column(ForeignKey("person_types.id"), nullable=True)
    status: Mapped[PersonStatus] = mapped_column(
        Enum(PersonStatus, name="person_status"), nullable=False, default=PersonStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    person_type: Mapped[PersonType | None] = relationship(back_populates="persons")
    face_embeddings: Mapped[list["PersonFaceEmbedding"]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )


class PersonFaceEmbedding(Base):
    __tablename__ = "person_face_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), nullable=False)
    faiss_index_id: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    person: Mapped[Person] = relationship(back_populates="face_embeddings")


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    zone_type: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    cameras: Mapped[list["Camera"]] = relationship(back_populates="zone", cascade="all, delete-orphan")
    access_rules: Mapped[list["ZoneAccessRule"]] = relationship(back_populates="zone", cascade="all, delete-orphan")


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    source_type: Mapped[CameraSourceType] = mapped_column(
        Enum(CameraSourceType, name="camera_source_type"), nullable=False, default=CameraSourceType.rtsp
    )
    rtsp_url: Mapped[str | None] = mapped_column(Text, nullable=True)  # null for source_type=browser
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sampling_fps: Mapped[float] = mapped_column(Float, nullable=False, default=1.5)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    zone: Mapped[Zone] = relationship(back_populates="cameras")


class ZoneAccessRule(Base):
    __tablename__ = "zone_access_rules"
    __table_args__ = (UniqueConstraint("person_id", "zone_id", name="uq_zone_access_rules_person_zone"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), nullable=False)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), nullable=False)
    access_level: Mapped[AccessLevel] = mapped_column(Enum(AccessLevel, name="access_level"), nullable=False)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    conditions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded, extensible partial-access rules
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    person: Mapped[Person] = relationship()
    zone: Mapped[Zone] = relationship(back_populates="access_rules")


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int | None] = mapped_column(ForeignKey("persons.id"), nullable=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id"), nullable=False)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AccessEvent(Base):
    __tablename__ = "access_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int | None] = mapped_column(ForeignKey("persons.id"), nullable=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id"), nullable=False)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), nullable=False)
    access_level_at_time: Mapped[AccessLevel] = mapped_column(Enum(AccessLevel, name="access_level_at_time"), nullable=False)
    decision: Mapped[AccessDecision] = mapped_column(Enum(AccessDecision, name="access_decision"), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="admin")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
