"""camera source_type (rtsp/browser), rtsp_url nullable

Revision ID: 7a2f9c1e4d80
Revises: 19c703464632
Create Date: 2026-08-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7a2f9c1e4d80"
down_revision: Union[str, None] = "19c703464632"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cameras",
        sa.Column(
            "source_type",
            sa.Enum("rtsp", "browser", name="camera_source_type"),
            nullable=False,
            server_default="rtsp",
        ),
    )
    op.alter_column("cameras", "rtsp_url", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column("cameras", "rtsp_url", existing_type=sa.Text(), nullable=False)
    op.drop_column("cameras", "source_type")
