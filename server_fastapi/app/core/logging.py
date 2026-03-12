import json
import logging
from pathlib import Path

from app.core.time_utils import iso_now_msk


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": iso_now_msk(),
            "level": record.levelname,
            "service": getattr(record, "service", "ai-trader-fastapi"),
            "operation": getattr(record, "operation", record.name),
            "message": record.getMessage(),
            "traceId": getattr(record, "trace_id", None),
            "requestId": getattr(record, "request_id", None),
            "entityId": getattr(record, "entity_id", None),
            "error.code": getattr(record, "error_code", None),
        }
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(log_level: str, runtime_error_log_path: str | None = None) -> None:
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(log_level.upper())

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.WARNING)
    stream_handler.setFormatter(JsonFormatter())
    root_logger.addHandler(stream_handler)

    if runtime_error_log_path:
        out = Path(runtime_error_log_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(out, encoding="utf-8")
        file_handler.setLevel(logging.ERROR)
        file_handler.setFormatter(JsonFormatter())
        root_logger.addHandler(file_handler)
