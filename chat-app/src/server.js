const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");
const config = require("./config");
const logger = require("./logger");
const { requestJson } = require("./http-client");

const startedAt = Date.now();
const publicDir = path.resolve(__dirname, "..", config.staticDir);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType
  });
  response.end(payload);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload exceeds 1MB"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });

    request.on("error", reject);
  });
}

function resolveStaticFile(requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    return null;
  }

  return filePath;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      service: "gateway-service",
      healthy: true,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      port: config.port
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    try {
      // O gateway agrega o health do backend para facilitar a demonstracao da arquitetura.
      const chatHealth = await requestJson(
        "GET",
        `${config.chatServiceUrl}/health`,
        undefined,
        { retries: config.maxRetries, timeoutMs: config.requestTimeoutMs }
      );

      sendJson(response, 200, {
        gateway: {
          healthy: true,
          port: config.port,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
        },
        chatService: chatHealth
      });
    } catch (error) {
      sendJson(response, 200, {
        gateway: {
          healthy: true,
          port: config.port,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
        },
        chatService: {
          healthy: false,
          error: error.message
        }
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/messages") {
    const room = url.searchParams.get("room") || "geral";
    const limit = url.searchParams.get("limit") || "50";
    const afterId = url.searchParams.get("afterId") || "0";

    try {
      const payload = await requestJson(
        "GET",
        `${config.chatServiceUrl}/messages?room=${encodeURIComponent(room)}&limit=${encodeURIComponent(limit)}&afterId=${encodeURIComponent(afterId)}`,
        undefined,
        { retries: config.maxRetries, timeoutMs: config.requestTimeoutMs }
      );

      sendJson(response, 200, payload);
    } catch (error) {
      logger.error("list_messages_failed", {
        room,
        error: error.message
      });

      sendJson(response, 503, {
        error: "Nao foi possivel carregar as mensagens no momento."
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/messages") {
    try {
      const payload = await parseBody(request);
      const data = await requestJson(
        "POST",
        `${config.chatServiceUrl}/messages`,
        payload,
        { retries: config.maxRetries, timeoutMs: config.requestTimeoutMs }
      );

      sendJson(response, 201, data);
    } catch (error) {
      const statusCode = error.statusCode || 503;
      logger.error("create_message_failed", {
        error: error.message,
        statusCode
      });

      sendJson(response, statusCode, {
        error: error.payload?.error || error.message || "Falha ao enviar mensagem."
      });
    }
    return;
  }

  sendJson(response, 404, {
    error: "Endpoint nao encontrado."
  });
}

const server = http.createServer(async (request, response) => {
  const startedRequestAt = Date.now();
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else {
      // O frontend fica no gateway para o navegador depender de apenas um ponto de entrada.
      const filePath = resolveStaticFile(url.pathname);
      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        sendJson(response, 404, { error: "Arquivo nao encontrado." });
        return;
      }

      sendText(response, 200, fs.readFileSync(filePath), contentTypeFor(filePath));
    }
  } catch (error) {
    logger.error("gateway_unhandled_error", {
      path: url.pathname,
      error: error.message
    });

    sendJson(response, 500, {
      error: "Erro interno no gateway."
    });
  } finally {
    logger.info("gateway_request_completed", {
      method: request.method,
      path: url.pathname,
      durationMs: Date.now() - startedRequestAt
    });
  }
});

server.listen(config.port, () => {
  logger.info("gateway_started", {
    port: config.port,
    chatServiceUrl: config.chatServiceUrl
  });
});
