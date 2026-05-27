function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  port: readNumber(process.env.MODERATION_PORT, 8082),
  maxMessageLength: readNumber(process.env.MAX_MESSAGE_LENGTH, 280),
  blockedTerms: (process.env.BLOCKED_TERMS || "spam,ofensa,palavrao")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
};
