const http = require("http");
const { URL } = require("url");
const config = require("./config");
const logger = require("./logger");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    request.on("error", reject);
  });
}

function sanitizeContent(content) {
  // Normaliza espacos para que a validacao tenha comportamento previsivel.
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim();
}

function moderationDecision(content) {
  const normalizedContent = content.toLowerCase();
  const matchedTerm = config.blockedTerms.find((term) => normalizedContent.includes(term));
  if (matchedTerm) {
    return {
      decision: "blocked",
      reason: `blocked_term:${matchedTerm}`,
      sanitizedContent: content
    };
  }

  return {
    decision: "accepted",
    reason: "accepted",
    sanitizedContent: content
  };
}

const server = http.createServer(async (request, response) => {
  const startedAt = Date.now();
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        service: "moderation-service",
        healthy: true,
        blockedTerms: config.blockedTerms.length
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/moderate") {
      const payload = await readJson(request);
      const sanitizedContent = sanitizeContent(payload.content);

      if (!sanitizedContent) {
        sendJson(response, 400, {
          decision: "blocked",
          reason: "empty_message",
          sanitizedContent: ""
        });
        return;
      }

      if (sanitizedContent.length > config.maxMessageLength) {
        sendJson(response, 422, {
          decision: "blocked",
          reason: "message_too_long",
          sanitizedContent
        });
        return;
      }

      const decision = moderationDecision(sanitizedContent);
      sendJson(response, 200, decision);
      return;
    }

    sendJson(response, 404, {
      error: "Endpoint nao encontrado."
    });
  } catch (error) {
    logger.error("moderation_request_failed", {
      path: url.pathname,
      error: error.message
    });
    sendJson(response, 500, {
      error: "Erro interno na moderacao."
    });
  } finally {
    logger.info("moderation_request_completed", {
      method: request.method,
      path: url.pathname,
      durationMs: Date.now() - startedAt
    });
  }
});

server.listen(config.port, () => {
  logger.info("moderation_started", {
    port: config.port,
    blockedTerms: config.blockedTerms
  });
});
