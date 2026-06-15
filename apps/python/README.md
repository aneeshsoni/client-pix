# Python Backend

This covers everything to get started from initial setup to production deployment for our python backend.

## Face Recognition Models

People recognition uses OpenCV YuNet and SFace ONNX model files stored outside
git. Install them in the backend app directory:

```bash
cd apps/python
uv run python scripts/download_face_models.py
```

Default paths:

```text
models_ml/faces/face_detection_yunet_2023mar.onnx
models_ml/faces/face_recognition_sface_2021dec.onnx
```

The app starts without these files, but `/api/face-scans/status` will report
the face backend as not ready and queued scan jobs will wait. Existing uploaded
photos are indexed from the dashboard People page with the "Scan Existing"
action.

Relevant environment variables:

```bash
FACE_DETECTION_ENABLED=true
FACE_SCAN_ON_UPLOAD=true
FACE_WORKER_CONCURRENCY=1
FACE_DETECTION_MODEL_PATH=./models_ml/faces/face_detection_yunet_2023mar.onnx
FACE_RECOGNITION_MODEL_PATH=./models_ml/faces/face_recognition_sface_2021dec.onnx
```

## Database Migrations

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database migrations.

### Automatic Migrations

Migrations run automatically on application startup via `init_db()`. For existing databases, the migration history will be automatically stamped to avoid re-running migrations.

### Manual Migration Commands

To run migrations manually inside the Docker container:

```bash
# Apply all pending migrations
docker exec clientpix-backend alembic upgrade head

# Check current migration status
docker exec clientpix-backend alembic current

# View migration history
docker exec clientpix-backend alembic history
```

### Creating New Migrations

When you modify a SQLAlchemy model, create a new migration:

```bash
# Auto-generate migration from model changes
docker exec clientpix-backend alembic revision --autogenerate -m "Description of changes"

# Or create an empty migration to customize
docker exec clientpix-backend alembic revision -m "Description of changes"
```

Migration files are created in `alembic/versions/` with timestamps in the filename.

### Migration Best Practices

1. **Always review auto-generated migrations** - Alembic may not detect all changes correctly
2. **Test migrations on a copy of production data** before deploying
3. **Never modify migrations that have been applied to production**
4. **Include both `upgrade()` and `downgrade()` functions** for rollback capability
