FROM node:20-alpine

WORKDIR /app

COPY package.json ./package.json
COPY public ./public
COPY src ./src

ENV GATEWAY_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "src/server.js"]
