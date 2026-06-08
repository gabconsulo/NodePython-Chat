// Importacoes dos modulos necessarios para criar um servidor HTTP
const http = require("http");
const { URL } = require("url");
const config = require("./config");
const logger = require("./logger");

// Envia uma resposta JSON com status code
function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

// Le o corpo JSON da requisicao de forma assincrona
function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    // Acumula chunks de dados
    request.on("data", (chunk) => {
      raw += chunk;
    });
    // Quando todos os dados foram recebidos, faz parsing JSON
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

// Limpa/normaliza o conteudo da mensagem para validacao consistente
function sanitizeContent(content) {
  // Normaliza espacos em branco (substitui multiplos espacos por um)
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim();
}

// Verifica se a mensagem contem palavras bloqueadas
function moderationDecision(content) {
  const normalizedContent = content.toLowerCase();
  // Procura por qualquer termo bloqueado na mensagem
  const matchedTerm = config.blockedTerms.find((term) => normalizedContent.includes(term));
  // Se encontrou um termo bloqueado, bloqueia a mensagem
  if (matchedTerm) {
    return {
      decision: "blocked",
      reason: `blocked_term:${matchedTerm}`,
      sanitizedContent: content
    };
  }

  // Caso contrário, aceita a mensagem
  return {
    decision: "accepted",
    reason: "accepted",
    sanitizedContent: content
  };
}

// Cria o servidor HTTP para processar requisicoes de moderacao
const server = http.createServer(async (request, response) => {
  const startedAt = Date.now();
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    // Endpoint de health check - verifica se o servico esta funcionando
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        service: "moderation-service",
        healthy: true,
        blockedTerms: config.blockedTerms.length
      });
      return;
    }

    // Endpoint principal de moderacao - analisa a mensagem
    if (request.method === "POST" && url.pathname === "/moderate") {
      const payload = await readJson(request);
      // Normaliza o conteudo da mensagem
      const sanitizedContent = sanitizeContent(payload.content);

      // Se a mensagem ficou vazia apos sanitizacao, bloqueia
      if (!sanitizedContent) {
        sendJson(response, 400, {
          decision: "blocked",
          reason: "empty_message",
          sanitizedContent: ""
        });
        return;
      }

      // Se a mensagem excedeu tamanho maximo, bloqueia
      if (sanitizedContent.length > config.maxMessageLength) {
        sendJson(response, 422, {
          decision: "blocked",
          reason: "message_too_long",
          sanitizedContent
        });
        return;
      }

      // Faz a decisao de moderacao (bloqueado ou aceito)
      const decision = moderationDecision(sanitizedContent);
      sendJson(response, 200, decision);
      return;
    }

    // Se nenhuma rota foi encontrada, retorna 404
    sendJson(response, 404, {
      error: "Endpoint nao encontrado."
    });
  } catch (error) {
    // Log de erro nao tratado
    logger.error("moderation_request_failed", {
      path: url.pathname,
      error: error.message
    });
    sendJson(response, 500, {
      error: "Erro interno na moderacao."
    });
  } finally {
    // Log de conclusao da requisicao com tempo de resposta
    logger.info("moderation_request_completed", {
      method: request.method,
      path: url.pathname,
      durationMs: Date.now() - startedAt
    });
  }
});

// Inicia o servidor na porta configurada
server.listen(config.port, () => {
  logger.info("moderation_started", {
    port: config.port,
    blockedTerms: config.blockedTerms
  });
});
