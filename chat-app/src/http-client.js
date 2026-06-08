const logger = require("./logger");

// Funcao auxiliar que aguarda um tempo em ms (para delays entre retries)
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Realiza uma requisicao HTTP JSON com suporte a retry e timeout
async function requestJson(method, url, body, options = {}) {
  // Extrai opcoes ou usa defaults
  const retries = options.retries ?? 0;
  const timeoutMs = options.timeoutMs ?? 2000;

  // Loop de tentativas com retry
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // Cria um controller para abortar requisicoes que levam muito tempo
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Faz a requisicao HTTP
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      // Le a resposta como texto e faz parsing JSON
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      // Se resposta nao foi OK (status 2xx), cria um erro
      if (!response.ok) {
        const error = new Error(data.error || `Request failed with status ${response.status}`);
        error.statusCode = response.status;
        error.payload = data;
        // Erros 5xx sao considerados retriaveis (problema temporario do servidor)
        error.retryable = response.status >= 500;
        throw error;
      }

      return data;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      // Erros de rede/timeout sao retriaveis por padrao, erros 4xx nao
      const retryable = error.retryable ?? !error.statusCode;

      logger.warn("downstream_request_failed", {
        url,
        method,
        attempt: attempt + 1,
        retries: retries + 1,
        error: error.message
      });

      // Se foi a ultima tentativa ou o erro nao e retriavel, lança a excecao
      if (isLastAttempt || !retryable) {
        throw error;
      }

      // Aguarda antes da proxima tentativa (backoff exponencial: 200ms, 400ms, etc)
      await sleep(200 * (attempt + 1));
    } finally {
      // Sempre limpa o timer
      clearTimeout(timer);
    }
  }

  throw new Error("Unexpected request flow");
}

module.exports = {
  requestJson
};
