import os
import sys
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-prod-please-1234567890")
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/test_aw_portal.db")
os.environ.setdefault("FERNET_KEY", "")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
