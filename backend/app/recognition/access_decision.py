from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AccessDecision, AccessLevel, ZoneAccessRule


def decide_access(db: Session, person_id: int, zone_id: int) -> tuple[AccessLevel, AccessDecision]:
    """Look up the person's access rule for this zone and translate it into
    a decision. No rule on file defaults to 'none'/'denied'. Time-window and
    other partial-access conditions (ZoneAccessRule.conditions) are not yet
    evaluated here — 'partial' is currently always surfaced as 'flagged'."""
    rule = db.scalar(
        select(ZoneAccessRule).where(ZoneAccessRule.person_id == person_id, ZoneAccessRule.zone_id == zone_id)
    )
    if rule is None:
        return AccessLevel.none, AccessDecision.denied

    if rule.access_level == AccessLevel.full:
        return AccessLevel.full, AccessDecision.allowed
    if rule.access_level == AccessLevel.partial:
        return AccessLevel.partial, AccessDecision.flagged
    return AccessLevel.none, AccessDecision.denied
