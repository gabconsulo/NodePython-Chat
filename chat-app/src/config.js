function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  port: readNumber(process.env.GATEWAY_PORT, 8080),
  chatServiceUrl: process.env.CHAT_SERVICE_URL || "http://127.0.0.1:8081",
  requestTimeoutMs: readNumber(process.env.GATEWAY_REQUEST_TIMEOUT_MS, 5000),
  maxRetries: readNumber(process.env.GATEWAY_MAX_RETRIES, 2),
  staticDir: process.env.STATIC_DIR || "public"
};
