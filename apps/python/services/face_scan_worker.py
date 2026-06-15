"""Background worker for face scan jobs."""

import asyncio

from core.config import FACE_WORKER_CONCURRENCY, FACE_WORKER_POLL_SECONDS
from core.database import async_session_maker
from services.face_recognition_service import face_recognition_service

_worker_tasks: set[asyncio.Task] = set()


async def _face_scan_worker(worker_id: int) -> None:
    """Process queued face scan jobs until cancelled."""
    while True:
        try:
            status = face_recognition_service.status()
            if not status.enabled or not status.ready:
                await asyncio.sleep(max(FACE_WORKER_POLL_SECONDS, 5))
                continue

            async with async_session_maker() as db:
                job_id = await face_recognition_service.claim_next_job(db)

            if job_id is None:
                await asyncio.sleep(FACE_WORKER_POLL_SECONDS)
                continue

            async with async_session_maker() as db:
                await face_recognition_service.process_job(db, job_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Warning: face scan worker {worker_id} failed: {exc}")
            await asyncio.sleep(FACE_WORKER_POLL_SECONDS)


def start_face_scan_workers() -> None:
    """Start configured face scan workers."""
    if _worker_tasks:
        return

    concurrency = max(0, FACE_WORKER_CONCURRENCY)
    for worker_id in range(concurrency):
        task = asyncio.create_task(_face_scan_worker(worker_id))
        _worker_tasks.add(task)
        task.add_done_callback(_worker_tasks.discard)


async def stop_face_scan_workers() -> None:
    """Stop all running face scan workers."""
    if not _worker_tasks:
        return

    tasks = list(_worker_tasks)
    for task in tasks:
        task.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)
    _worker_tasks.clear()
