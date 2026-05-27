FROM node:20-alpine

WORKDIR /app

COPY package.json ./package.json
COPY src ./src

ENV MODERATION_PORT=8082

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8082/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "src/server.js"]
