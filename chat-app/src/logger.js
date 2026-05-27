function log(level, message, metadata = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    service: "gateway-service",
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
    log("info", message, metadata);
  },
  warn(message, metadata) {
    log("warn", message, metadata);
  },
  error(message, metadata) {
    log("error", message, metadata);
  }
};
