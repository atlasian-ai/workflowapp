import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflow_definitions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Auto-incrementing human-readable request number (REQ_1, REQ_2, …)
    request_number: Mapped[int] = mapped_column(
        Integer,
        server_default=text("nextval('request_number_seq')"),
        nullable=False,
        unique=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="in_progress"
    )  # in_progress | completed | rejected | cancelled
    current_step_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Frozen copy of definition.config at the moment this instance was completed.
    # None for in-progress / rejected instances; they always read from the live definition.
    config_snapshot: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Relationships
    assignments: Mapped[list["StepAssignment"]] = relationship(  # noqa: F821
        back_populates="instance", cascade="all, delete-orphan"
    )
    submissions: Mapped[list["StepSubmission"]] = relationship(  # noqa: F821
        back_populates="instance", cascade="all, delete-orphan"
    )
    approvals: Mapped[list["Approval"]] = relationship(  # noqa: F821
        back_populates="instance", cascade="all, delete-orphan"
    )
    # step_comments relationship defined via backref in step_comment.py


class StepAssignment(Base):
    __tablename__ = "step_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflow_instances.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_id: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_to: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    instance: Mapped["WorkflowInstance"] = relationship(back_populates="assignments")
