// Importacoes dos modulos necessarios para o gateway
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");
const config = require("./config");
const logger = require("./logger");
const { requestJson } = require("./http-client");

// Registra quando o servidor foi iniciado para calcular uptime
const startedAt = Date.now();
// Caminho para os arquivos estáticos (HTML, CSS, JS do frontend)
const publicDir = path.resolve(__dirname, "..", config.staticDir);

// Envia uma resposta JSON com status code especifico
function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

// Envia uma resposta em texto com tipo de conteudo customizado (HTML, CSS, JS, etc)
function sendText(response, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType
  });
  response.end(payload);
}

// Le o corpo da requisicao (payload JSON) de forma assincrona
function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    // Acumula os chunks de dados recebidos
    request.on("data", (chunk) => {
      raw += chunk;
      // Protecao contra payloads muito grandes (limite de 1MB)
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload exceeds 1MB"));
        request.destroy();
      }
    });

    // Quando todos os dados foram recebidos, faz parsing JSON
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

// Resolve um caminho de arquivo estático de forma segura (previne path traversal)
function resolveStaticFile(requestPath) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relativePath);

  // Verifica se o arquivo resolvido ainda esta dentro do diretorio publico (seguranca)
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== publicDir) {
    return null;
  }

  return filePath;
}

// Retorna o tipo de conteudo apropriado baseado na extensao do arquivo
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

// Trata requisicoes de API (/health, /api/status, /api/messages, etc)
async function handleApi(request, response, url) {
  // Endpoint de health check - retorna status do gateway
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      service: "gateway-service",
      healthy: true,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      port: config.port
    });
    return;
  }

  // Endpoint que agrega status de todos os servicos da arquitetura distribuida
  if (request.method === "GET" && url.pathname === "/api/status") {
    try {
      // Faz requisicao para o servico de chat obter saude dos dependentes
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
      // Se o servico de chat esta down, ainda retorna 200 mas marca como unhealthy
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

  // Endpoint para listar mensagens - pode filtrar por sala e paginar
  if (request.method === "GET" && url.pathname === "/api/messages") {
    const room = url.searchParams.get("room") || "geral";
    const limit = url.searchParams.get("limit") || "50";
    const afterId = url.searchParams.get("afterId") || "0";

    try {
      // Delega a solicitacao para o servico de chat
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

  // Endpoint para criar uma nova mensagem
  if (request.method === "POST" && url.pathname === "/api/messages") {
    try {
      const payload = await parseBody(request);
      // Envia a mensagem para o servico de chat que se encarregara da moderacao
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

  // Se nenhum endpoint foi encontrado, retorna 404
  sendJson(response, 404, {
    error: "Endpoint nao encontrado."
  });
}

// Cria o servidor HTTP que trata tanto APIs quanto arquivos estáticos
const server = http.createServer(async (request, response) => {
  const startedRequestAt = Date.now();
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    // Se e uma requisicao de API ou health check, delega para handleApi
    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else {
      // Caso contrário, tenta servir um arquivo estático do frontend
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
    // Log de conclusao da requisicao com tempo de resposta
    logger.info("gateway_request_completed", {
      method: request.method,
      path: url.pathname,
      durationMs: Date.now() - startedRequestAt
    });
  }
});

// Inicia o servidor na porta configurada
server.listen(config.port, () => {
  logger.info("gateway_started", {
    port: config.port,
    chatServiceUrl: config.chatServiceUrl
  });
});
