from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import os
import threading

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOG_PATH = ROOT / "logs" / "predictions.jsonl"

_lock = threading.Lock()


def _log_path():
    configured = os.environ.get("PREDICTION_LOG_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_LOG_PATH


def _write(record):
    timestamp = datetime.now(timezone.utc).isoformat()
    payload = {"timestamp": timestamp, **record}
    path = _log_path()

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        with _lock:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(f"{line}\n")
    except OSError:
        # Observability must never take down inference.
        return


def _round_scores(scores):
    if not isinstance(scores, dict):
        return scores

    return {
        str(key): round(float(value), 6)
        for key, value in scores.items()
        if isinstance(value, (int, float))
    }


def log_request(method, path, status, duration_ms, request_id):
    _write(
        {
            "type": "request",
            "method": method,
            "path": path,
            "status": int(status),
            "durationMs": round(float(duration_ms), 2),
            "requestId": request_id,
        }
    )


def log_prediction(endpoint, model, scores=None, flags=None, details=None):
    record = {
        "type": "prediction",
        "endpoint": endpoint,
        "model": model,
    }

    if scores is not None:
        record["scores"] = _round_scores(scores)
    if flags is not None:
        record["flags"] = list(flags)
    if details is not None:
        record["details"] = {
            key: value
            for key, value in details.items()
            if key not in {"text", "transcript", "filename"}
        }

    _write(record)


def log_error(endpoint, error, status=None):
    _write(
        {
            "type": "error",
            "endpoint": endpoint,
            "errorType": type(error).__name__,
            "status": int(status) if status is not None else None,
        }
    )
