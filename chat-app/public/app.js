const statusCards = document.getElementById("status-cards");
const messagesContainer = document.getElementById("messages");
const feedback = document.getElementById("feedback");
const form = document.getElementById("message-form");
const submitButton = document.getElementById("submit-button");

let lastMessageId = 0;
let lastRenderedSignature = "";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString("pt-BR");
  } catch {
    return timestamp;
  }
}

function renderStatus(data) {
  const items = [
    {
      name: "Gateway",
      healthy: data.gateway?.healthy,
      details: `Porta ${data.gateway?.port} | uptime ${data.gateway?.uptimeSeconds ?? 0}s`
    },
    {
      name: "Chat service",
      healthy: data.chatService?.healthy,
      details: data.chatService?.healthy
        ? `Banco ${data.chatService.database} | degradado ${data.chatService.degradedWritesEnabled}`
        : `Falha: ${data.chatService?.error ?? "indisponivel"}`
    },
    {
      name: "Moderacao",
      healthy: data.chatService?.dependencies?.moderationReachable,
      details: data.chatService?.dependencies?.moderationReachable
        ? "Servico respondendo normalmente"
        : "Chat continua operando com degradacao controlada"
    }
  ];

  statusCards.innerHTML = items
    .map(
      (item) => `
        <div class="status-card">
          <strong>${item.name}</strong>
          <span class="${item.healthy ? "status-ok" : "status-down"}">
            ${item.healthy ? "Saudavel" : "Indisponivel"}
          </span>
          <p>${item.details}</p>
        </div>
      `
    )
    .join("");
}

function buildSignature(messages) {
  return messages.map((message) => `${message.id}:${message.status}`).join("|");
}

function renderMessages(messages) {
  const signature = buildSignature(messages);
  if (signature === lastRenderedSignature) {
    return;
  }

  lastRenderedSignature = signature;

  if (!messages.length) {
    messagesContainer.innerHTML = '<p class="empty-state">Nenhuma mensagem enviada ainda.</p>';
    return;
  }

  messagesContainer.innerHTML = messages
    .map(
      (message) => `
        <article class="message ${message.status === "pending_review" ? "pending" : ""}">
          <div class="message-header">
            <strong>${escapeHtml(message.username)}</strong>
            <span>Sala: ${escapeHtml(message.room)}</span>
            <span>${formatTimestamp(message.createdAt)}</span>
            <span>${message.status === "pending_review" ? "Pendente de revisao" : "Aceita"}</span>
          </div>
          <p class="message-content">${escapeHtml(message.content)}</p>
        </article>
      `
    )
    .join("");
}

async function loadStatus() {
  const response = await fetch("/api/status");
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o status distribuido.");
  }

  const payload = await response.json();
  renderStatus(payload);
}

async function loadMessages() {
  const room = document.getElementById("room").value || "geral";
  const response = await fetch(`/api/messages?room=${encodeURIComponent(room)}`);
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as mensagens.");
  }

  const payload = await response.json();
  const messages = payload.messages || [];
  if (messages.length) {
    lastMessageId = Math.max(lastMessageId, messages[messages.length - 1].id);
  }
  renderMessages(messages);
}

async function refreshDashboard() {
  try {
    await Promise.all([loadStatus(), loadMessages()]);
  } catch (error) {
    setFeedback(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    username: document.getElementById("username").value.trim(),
    room: document.getElementById("room").value.trim() || "geral",
    content: document.getElementById("content").value.trim()
  };

  if (!payload.username || !payload.content) {
    setFeedback("Informe usuario e mensagem antes de enviar.", true);
    return;
  }

  submitButton.disabled = true;
  setFeedback("Enviando mensagem para o gateway...");

  try {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Falha ao enviar a mensagem.");
    }

    document.getElementById("content").value = "";
    setFeedback(
      data.message.status === "pending_review"
        ? "Mensagem salva em modo degradado: moderacao indisponivel."
        : "Mensagem entregue com sucesso."
    );

    await refreshDashboard();
  } catch (error) {
    setFeedback(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

refreshDashboard();
setInterval(refreshDashboard, 2500);
