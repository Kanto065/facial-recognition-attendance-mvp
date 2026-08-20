"""Bootstrap an initial admin user and default person types.

Run after `alembic upgrade head`:
    python -m scripts.seed --username admin --password change-me

Safe to re-run: skips anything that already exists.
"""
import argparse
import sys

sys.path.insert(0, ".")

from sqlalchemy import select  # noqa: E402

from app.auth.security import hash_password  # noqa: E402
from app.db.models import AdminUser, PersonCategory, PersonType  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402

DEFAULT_PERSON_TYPES = [
    ("employee", PersonCategory.internal),
    ("contractor", PersonCategory.external),
    ("visitor", PersonCategory.external),
    ("vendor", PersonCategory.external),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if not db.scalar(select(AdminUser).where(AdminUser.username == args.username)):
            db.add(AdminUser(username=args.username, password_hash=hash_password(args.password), role="admin"))
            print(f'Created admin user "{args.username}"')
        else:
            print(f'Admin user "{args.username}" already exists, skipping')

        for name, category in DEFAULT_PERSON_TYPES:
            if not db.scalar(select(PersonType).where(PersonType.name == name)):
                db.add(PersonType(name=name, category=category))
                print(f'Created person type "{name}"')

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
