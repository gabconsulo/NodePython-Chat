// Funcao interna que estrutura e emite logs em formato JSON
function emit(level, message, metadata = {}) {
  // Cria objeto JSON estruturado com timestamp, nivel, mensagem e dados adicionais
  const payload = {
    timestamp: new Date().toISOString(),
    service: "moderation-service",
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
    emit("info", message, metadata);
  },
  // Log de aviso - para situacoes anormais mas recuperaveis
  warn(message, metadata) {
    emit("warn", message, metadata);
  },
  // Log de erro - para situacoes que requerem atencao
  error(message, metadata) {
    emit("error", message, metadata);
  }
};
