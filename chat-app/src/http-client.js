const logger = require("./logger");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(method, url, body, options = {}) {
  const retries = options.retries ?? 0;
  const timeoutMs = options.timeoutMs ?? 2000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        const error = new Error(data.error || `Request failed with status ${response.status}`);
        error.statusCode = response.status;
        error.payload = data;
        throw error;
      }

      return data;
    } catch (error) {
      const isLastAttempt = attempt === retries;

      logger.warn("downstream_request_failed", {
        url,
        method,
        attempt: attempt + 1,
        retries: retries + 1,
        error: error.message
      });

      if (isLastAttempt) {
        throw error;
      }

      await sleep(200 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Unexpected request flow");
}

module.exports = {
  requestJson
};
