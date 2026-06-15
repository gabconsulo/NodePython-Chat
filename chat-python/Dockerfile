FROM python:3.12-slim

WORKDIR /app

COPY src ./src

ENV CHAT_SERVICE_PORT=8081
ENV CHAT_DB_PATH=/data/chat.db

EXPOSE 8081

HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD ["python", "-c", "import json, urllib.request, sys; response = urllib.request.urlopen('http://127.0.0.1:8081/health', timeout=2); data = json.loads(response.read().decode('utf-8')); sys.exit(0 if data.get('healthy') else 1)"]

CMD ["python", "src/server.py"]
