// Funcao interna que estrutura e emite logs em formato JSON
function log(level, message, metadata = {}) {
  // Cria um objeto JSON estruturado com timestamp, nivel, mensagem e dados adicionais
  const payload = {
    timestamp: new Date().toISOString(),
    service: "gateway-service",
    level,
    message,
    ...metadata
  };

  // Converte para string JSON para facilitar parsing em ferramentas externas
  const line = JSON.stringify(payload);
  // Erros vao para stderr, tudo mais para stdout
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

// Exporta funcoes de conveniencia para cada nivel de log
module.exports = {
  // Log informativo - para eventos normais da aplicacao
  info(message, metadata) {
    log("info", message, metadata);
  },
  // Log de aviso - para situacoes anormais mas recuperaveis
  warn(message, metadata) {
    log("warn", message, metadata);
  },
  // Log de erro - para situacoes que requerem atencao
  error(message, metadata) {
    log("error", message, metadata);
  }
};
