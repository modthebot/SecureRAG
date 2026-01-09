"""Database setup and session management."""
import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Create data directory if it doesn't exist
data_dir = Path(settings.data_dir)
data_dir.mkdir(parents=True, exist_ok=True)
projects_dir = data_dir / "projects"
projects_dir.mkdir(parents=True, exist_ok=True)

# SQLite database path
DATABASE_URL = f"sqlite:///{projects_dir / 'projects.db'}"

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    echo=False  # Set to True for SQL query logging
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Dependency for getting database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    try:
        logger.info("Initializing database tables...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified successfully")
        migrate_db()
    except Exception as e:
        logger.error(f"Error initializing database: {e}", exc_info=True)
        raise


def migrate_db():
    """Migrate database schema for existing tables."""
    from sqlalchemy import text, inspect
    
    try:
        inspector = inspect(engine)
        table_names = inspector.get_table_names()
        logger.debug(f"Database tables found: {table_names}")
        
        # Check if projects table exists
        if 'projects' in table_names:
            logger.debug("Projects table exists, checking for schema migrations...")
            # Get existing columns
            columns = [col['name'] for col in inspector.get_columns('projects')]
            logger.debug(f"Projects table columns: {columns}")
            
            # Add pinned_links column if it doesn't exist
            if 'pinned_links' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN pinned_links TEXT"))
                    logger.info("Added pinned_links column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add pinned_links column: {e}")
            
            # Add notes column if it doesn't exist
            if 'notes' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN notes TEXT"))
                    logger.info("Added notes column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add notes column: {e}")
            
            # Add tests_checklist column if it doesn't exist
            if 'tests_checklist' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN tests_checklist TEXT"))
                    logger.info("Added tests_checklist column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add tests_checklist column: {e}")
            
            # Add progress_percentage column if it doesn't exist
            if 'progress_percentage' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN progress_percentage INTEGER DEFAULT 0"))
                    logger.info("Added progress_percentage column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add progress_percentage column: {e}")
            
            # Add pentest_stages column if it doesn't exist
            if 'pentest_stages' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN pentest_stages TEXT"))
                    logger.info("Added pentest_stages column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add pentest_stages column: {e}")

            # Add parent_doc_id column if it doesn't exist
            if 'parent_doc_id' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN parent_doc_id VARCHAR(255)"))
                    logger.info("Added parent_doc_id column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add parent_doc_id column: {e}")

            # Add supporting_doc_ids column if it doesn't exist
            if 'supporting_doc_ids' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN supporting_doc_ids TEXT"))
                    logger.info("Added supporting_doc_ids column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add supporting_doc_ids column: {e}")
            
            # Add completed_date column if it doesn't exist
            if 'completed_date' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN completed_date DATETIME"))
                    logger.info("Added completed_date column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add completed_date column: {e}")
            
            # Add leave_days column if it doesn't exist
            if 'leave_days' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN leave_days INTEGER DEFAULT 0"))
                    logger.info("Added leave_days column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add leave_days column: {e}")
            
            # Add business_days_worked column if it doesn't exist
            if 'business_days_worked' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN business_days_worked INTEGER DEFAULT 0"))
                    logger.info("Added business_days_worked column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add business_days_worked column: {e}")
            
            # Add kickoff_status column if it doesn't exist
            if 'kickoff_status' not in columns:
                try:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN kickoff_status VARCHAR(50)"))
                        # Set default value for existing rows
                        conn.execute(text("UPDATE projects SET kickoff_status = 'queued' WHERE kickoff_status IS NULL"))
                    logger.info("Added kickoff_status column to projects table")
                except Exception as e:
                    logger.warning(f"Could not add kickoff_status column: {e}")
            
            # Note: notion_link column will remain but won't be used
            # SQLite doesn't support DROP COLUMN easily without recreating the table
    except Exception as e:
        logger.error(f"Error during database migration: {e}", exc_info=True)

