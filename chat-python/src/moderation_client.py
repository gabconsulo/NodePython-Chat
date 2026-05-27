import json
import time
import urllib.error
import urllib.request

from config import ALLOW_DEGRADED_WRITES, MAX_RETRIES, MODERATION_SERVICE_URL, REQUEST_TIMEOUT_SECONDS
import logger


def moderate_message(payload):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url=f"{MODERATION_SERVICE_URL}/moderate",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            response_body = error.read().decode("utf-8") or "{}"
            data = json.loads(response_body)
            return data
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            logger.warning(
                "moderation_request_failed",
                attempt=attempt + 1,
                retries=MAX_RETRIES + 1,
                error=str(error),
            )
            if attempt == MAX_RETRIES:
                if ALLOW_DEGRADED_WRITES:
                    # O chat continua aceitando mensagens e sinaliza que a moderacao falhou.
                    return {
                        "decision": "accepted",
                        "sanitizedContent": payload["content"],
                        "reason": "moderation_unavailable",
                        "degraded": True,
                    }
                raise
            time.sleep(0.2 * (attempt + 1))

    return {
        "decision": "accepted",
        "sanitizedContent": payload["content"],
        "reason": "unexpected_fallback",
        "degraded": True,
    }


def moderation_healthcheck() -> bool:
    request = urllib.request.Request(url=f"{MODERATION_SERVICE_URL}/health", method="GET")
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        data = json.loads(response.read().decode("utf-8"))
        return bool(data.get("healthy"))
