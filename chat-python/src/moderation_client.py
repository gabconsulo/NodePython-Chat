# Importacoes para fazer requisicoes HTTP e manipular timeouts
import json
import time
import urllib.error
import urllib.request

from config import ALLOW_DEGRADED_WRITES, MAX_RETRIES, MODERATION_SERVICE_URL, REQUEST_TIMEOUT_SECONDS
import logger


# Envia uma mensagem para o servico de moderacao para analise
def moderate_message(payload):
    # Serializa o payload para JSON
    body = json.dumps(payload).encode("utf-8")
    # Cria requisicao POST para o servico de moderacao
    request = urllib.request.Request(
        url=f"{MODERATION_SERVICE_URL}/moderate",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    # Loop de tentativas com retry
    for attempt in range(MAX_RETRIES + 1):
        try:
            # Faz requisicao com timeout
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                # Lê e faz parsing da resposta JSON
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            # Se receber um HTTPError (status code 4xx ou 5xx), retorna a resposta
            response_body = error.read().decode("utf-8") or "{}"
            data = json.loads(response_body)
            return data
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            # Erros de conexao/timeout sao retriaveis
            logger.warning(
                "moderation_request_failed",
                attempt=attempt + 1,
                retries=MAX_RETRIES + 1,
                error=str(error),
            )
            # Se foi a ultima tentativa
            if attempt == MAX_RETRIES:
                # Se modo degradado esta habilitado, permite continuar sem moderacao
                if ALLOW_DEGRADED_WRITES:
                    return {
                        "decision": "accepted",
                        "sanitizedContent": payload["content"],
                        "reason": "moderation_unavailable",
                        "degraded": True,
                    }
                # Caso contrario, lança a excecao
                raise
            # Aguarda antes da proxima tentativa (backoff: 200ms, 400ms, etc)
            time.sleep(0.2 * (attempt + 1))

    # Fallback final (nunca deve chegar aqui, mas por seguranca retorna aceito em modo degradado)
    return {
        "decision": "accepted",
        "sanitizedContent": payload["content"],
        "reason": "unexpected_fallback",
        "degraded": True,
    }


# Testa se o servico de moderacao esta acessivel
def moderation_healthcheck() -> bool:
    # Faz requisicao GET para /health do servico de moderacao
    request = urllib.request.Request(url=f"{MODERATION_SERVICE_URL}/health", method="GET")
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        # Se conseguiu ler a resposta e data.healthy e true, retorna true
        data = json.loads(response.read().decode("utf-8"))
        return bool(data.get("healthy"))
