function emit(level, message, metadata = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    service: "moderation-service",
    level,
    message,
    ...metadata
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

module.exports = {
  info(message, metadata) {
    emit("info", message, metadata);
  },
  warn(message, metadata) {
    emit("warn", message, metadata);
  },
  error(message, metadata) {
    emit("error", message, metadata);
  }
};
