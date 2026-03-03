from __future__ import annotations
import boto3
import structlog
from typing import Any

from app.config import settings

log = structlog.get_logger(service="agent-service", module="services.storage")

_s3_client = None


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
        )
    return _s3_client


async def upload_artifact(
    key: str,
    content: str | bytes,
    content_type: str = "application/json",
) -> dict[str, Any]:
    """Upload an artifact to S3 and return metadata."""
    client = _get_s3_client()
    body = content.encode("utf-8") if isinstance(content, str) else content
    size = len(body)

    client.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=body,
        ContentType=content_type,
    )

    log.info("artifact_uploaded", key=key, size=size, content_type=content_type)
    return {
        "key": key,
        "bucket": settings.S3_BUCKET,
        "size": size,
        "content_type": content_type,
    }
