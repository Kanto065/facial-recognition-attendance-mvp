import sqlite3
from datetime import datetime, timedelta
from typing import List, Optional

__all__ = ["AttendanceDB"]


class AttendanceDB:
    """SQLite-backed store for enrolled employees and attendance log records."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS employees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    enrolled_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS attendance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def add_employee(self, name: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO employees (name, enrolled_at) VALUES (?, ?)",
                (name, datetime.utcnow().isoformat()),
            )
            conn.commit()

    def list_employees(self) -> List[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT name, enrolled_at FROM employees ORDER BY name"
            ).fetchall()
        return [{"name": row[0], "enrolled_at": row[1]} for row in rows]

    def delete_employee(self, name: str) -> bool:
        """Delete an employee record. Returns True if a row was deleted."""
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM employees WHERE name = ?", (name,))
            conn.commit()
        return cursor.rowcount > 0

    def last_seen(self, name: str) -> Optional[datetime]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT timestamp FROM attendance WHERE name = ? ORDER BY timestamp DESC LIMIT 1",
                (name,),
            ).fetchone()
        if row is None:
            return None
        return datetime.fromisoformat(row[0])

    def log_attendance(self, name: str, cooldown_seconds: int = 300) -> bool:
        """Log an attendance record for `name` unless one was already logged
        within `cooldown_seconds`. Returns True if a new record was logged.
        """
        last = self.last_seen(name)
        now = datetime.utcnow()
        if last is not None and now - last < timedelta(seconds=cooldown_seconds):
            return False

        with self._connect() as conn:
            conn.execute(
                "INSERT INTO attendance (name, timestamp) VALUES (?, ?)",
                (name, now.isoformat()),
            )
            conn.commit()
        return True
