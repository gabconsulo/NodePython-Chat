// Funcao auxiliar para ler numeros das variaveis de ambiente com fallback
function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Exporta configuracoes do gateway lidas das variaveis de ambiente
module.exports = {
  // Porta em que o gateway escuta (Render injeta PORT; local usa GATEWAY_PORT)
  port: readNumber(process.env.PORT || process.env.GATEWAY_PORT, 8080),
  // URL completa do servico de chat (padrao localhost:8081)
  chatServiceUrl: process.env.CHAT_SERVICE_URL || "http://127.0.0.1:8081",
  // Timeout em ms para requisicoes feitas pelo gateway (padrao 5s)
  requestTimeoutMs: readNumber(process.env.GATEWAY_REQUEST_TIMEOUT_MS, 5000),
  // Numero de tentativas de retry para requisicoes com falha (padrao 2)
  maxRetries: readNumber(process.env.GATEWAY_MAX_RETRIES, 2),
  // Diretorio onde os arquivos estáticos (HTML, CSS, JS) estao armazenados
  staticDir: process.env.STATIC_DIR || "public"
};
