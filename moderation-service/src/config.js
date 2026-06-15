// Funcao auxiliar para ler numeros das variaveis de ambiente com fallback
function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Exporta configuracoes do servico de moderacao
module.exports = {
  // Porta em que o servico de moderacao escuta (Render injeta PORT; local usa MODERATION_PORT)
  port: readNumber(process.env.PORT || process.env.MODERATION_PORT, 8082),
  // Tamanho maximo de uma mensagem em caracteres (padrao 280)
  maxMessageLength: readNumber(process.env.MAX_MESSAGE_LENGTH, 280),
  // Lista de termos bloqueados - lê da variavel de ambiente e faz parsing
  blockedTerms: (process.env.BLOCKED_TERMS || "spam,ofensa,palavrao")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
};
