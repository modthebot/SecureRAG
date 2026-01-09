"""Project and vulnerability models."""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.database import Base


class ProjectStatus(str, enum.Enum):
    """Project status enumeration."""
    ONGOING = "ongoing"
    PAST = "past"


class ReportingStatus(str, enum.Enum):
    """Reporting status enumeration."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class KickoffStatus(str, enum.Enum):
    """Kickoff status enumeration."""
    TICKET_ASSIGNED = "ticket_assigned"
    QUEUED = "queued"
    IN_TALKS = "in_talks"
    DONE = "done"


class TechnologyType(str, enum.Enum):
    """Technology type enumeration."""
    WEB = "WEB"
    API = "API"
    APK = "APK"
    IPA = "IPA"
    THICK = "THICK"
    AI = "AI"
    AWS = "AWS"
    GCP = "GCP"
    OTHER = "OTHER"


class VulnerabilitySeverity(str, enum.Enum):
    """Vulnerability severity enumeration."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class VulnerabilityStatus(str, enum.Enum):
    """Vulnerability status enumeration."""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    ACCEPTED = "accepted"


class Project(Base):
    """Project model."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(ProjectStatus), default=ProjectStatus.ONGOING, nullable=False, index=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    kickoff_status = Column(SQLEnum(KickoffStatus), default=KickoffStatus.QUEUED, nullable=True)
    technology_type = Column(SQLEnum(TechnologyType), nullable=True, index=True)
    reporting_status = Column(SQLEnum(ReportingStatus), default=ReportingStatus.NOT_STARTED, nullable=False)
    psm_name = Column(String(255), nullable=True)
    functional_owner = Column(String(255), nullable=True)
    jira_ticket_link = Column(String(500), nullable=True)
    sharepoint_link = Column(String(500), nullable=True)
    pinned_links = Column(JSON, nullable=True, default=None)  # Array of {label: str, url: str}
    parent_doc_id = Column(String(255), nullable=True, index=True)  # Main technical document
    supporting_doc_ids = Column(JSON, nullable=True, default=None)  # List of supporting doc ids
    notes = Column(Text, nullable=True)  # Project notes
    tests_checklist = Column(JSON, nullable=True, default=None)  # Array of {test: str, done: bool, date: str}
    pentest_stages = Column(JSON, nullable=True, default=None)  # Array of {stage: str, done: bool, date: str} - static stages
    progress_percentage = Column(Integer, nullable=True, default=0)  # 0-100 (calculated from pentest_stages)
    summary = Column(Text, nullable=True)
    doc_id = Column(String(255), nullable=True, index=True)  # Link to document in documents_store
    completed_date = Column(DateTime, nullable=True)  # Date when project was marked as complete
    leave_days = Column(Integer, nullable=True, default=0)  # Number of days on leave during project
    business_days_worked = Column(Integer, nullable=True, default=0)  # Calculated business days worked
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    vulnerabilities = relationship("Vulnerability", back_populates="project", cascade="all, delete-orphan")


class Vulnerability(Base):
    """Vulnerability model."""
    __tablename__ = "vulnerabilities"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    type = Column(String(255), nullable=False)
    severity = Column(SQLEnum(VulnerabilitySeverity), nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(VulnerabilityStatus), default=VulnerabilityStatus.OPEN, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="vulnerabilities")

