from app.database.faiss_db import FaceDatabase

# app.database.sqlite_db.AttendanceDB is MVP-only and superseded by the MSSQL
# schema in app.db.models (see docs/warehouse-architecture.md) — left in place
# for reference, not imported by the new app.

__all__ = ["FaceDatabase"]
