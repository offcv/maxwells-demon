from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Index, Text
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum
from dataclasses import dataclass
from app.database import Base

class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id = Column(String, primary_key=True, index=True)
    scan_paths = Column(Text) # JSON serialized [{"path": "/nas", "is_exclude": false}]
    status = Column(String) # done / error
    scanned_total = Column(Integer, default=0)
    file_count = Column(Integer, default=0)
    group_count = Column(Integer, default=0)
    total_size = Column(Integer, default=0)
    reclaimable_size = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    scan_duration_sec = Column(Float, default=0.0)

class ScanFile(Base):
    __tablename__ = "scan_files"
    __table_args__ = (
        Index("ix_scan_files_session_sha256", "session_id", "sha256"),
        Index("ix_scan_files_session_group", "session_id", "group_id"),
        Index("ix_scan_files_session_path", "session_id", "path"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("scan_sessions.id"))
    path = Column(Text, nullable=False)
    size = Column(Integer, default=0)
    sha256 = Column(String, nullable=False)
    created_time = Column(Float, default=0.0)
    modified_time = Column(Float, default=0.0)
    group_id = Column(Integer, nullable=False)

class FolderMark(Base):
    __tablename__ = "folder_marks"

    session_id = Column(String, ForeignKey("scan_sessions.id"), primary_key=True)
    path = Column(Text, primary_key=True)
    mark = Column(String, nullable=False) # keep / delete

class FileOverride(Base):
    __tablename__ = "file_overrides"

    session_id = Column(String, ForeignKey("scan_sessions.id"), primary_key=True)
    file_path = Column(Text, primary_key=True)
    action = Column(String, nullable=False) # keep / delete
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MarkSourceType(str, enum.Enum):
    OVERRIDE = "override"
    FOLDER_MARK = "folder_mark"
    DEFAULT = "default"

class FileActionType(str, enum.Enum):
    KEEP = "keep"
    DELETE = "delete"

@dataclass
class FileAction:
    path: str
    action: FileActionType
    mark_source_type: MarkSourceType
    mark_source: str
