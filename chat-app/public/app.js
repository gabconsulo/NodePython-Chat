// Elementos do DOM que serao manipulados
const statusCards = document.getElementById("status-cards");
const messagesContainer = document.getElementById("messages");
const feedback = document.getElementById("feedback");
const form = document.getElementById("message-form");
const submitButton = document.getElementById("submit-button");

// Rastreia o ID da última mensagem para carregamento incremental
let lastMessageId = 0;
// Rastreia a "assinatura" das mensagens renderizadas para evitar re-renders desnecessarios
let lastRenderedSignature = "";

// Escapa caracteres especiais para evitar XSS
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Define mensagem de feedback ao usuario (sucesso ou erro)
function setFeedback(message, isError = false) {
  feedback.textContent = message;
  // Adiciona classe "error" se for erro, remove se for sucesso
  feedback.classList.toggle("error", isError);
}

// Formata um timestamp ISO para formato local legivel
function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString("pt-BR");
  } catch {
    return timestamp;
  }
}

// Renderiza os cards de status dos servicos (gateway, chat service, moderacao)
function renderStatus(data) {
  // Define os 3 servicos monitorados e seus status
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

  // Gera HTML para cada card e renderiza
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

// Cria uma "assinatura" das mensagens baseada em IDs e status (para detectar mudancas)
function buildSignature(messages) {
  return messages.map((message) => `${message.id}:${message.status}`).join("|");
}

// Renderiza a lista de mensagens no DOM
function renderMessages(messages) {
  // Se a assinatura nao mudou, nao renderiza (otimizacao)
  const signature = buildSignature(messages);
  if (signature === lastRenderedSignature) {
    return;
  }

  lastRenderedSignature = signature;

  // Se nao ha mensagens, mostra estado vazio
  if (!messages.length) {
    messagesContainer.innerHTML = '<p class="empty-state">Nenhuma mensagem enviada ainda.</p>';
    return;
  }

  // Renderiza cada mensagem como um article com header e conteudo
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

// Carrega o status dos servicos via API
async function loadStatus() {
  const response = await fetch("/api/status");
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o status distribuido.");
  }

  const payload = await response.json();
  renderStatus(payload);
}

// Carrega as mensagens da sala atual
async function loadMessages() {
  const room = document.getElementById("room").value || "geral";
  const response = await fetch(`/api/messages?room=${encodeURIComponent(room)}`);
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar as mensagens.");
  }

  const payload = await response.json();
  const messages = payload.messages || [];
  // Atualiza o ID da última mensagem para carregamento posterior
  if (messages.length) {
    lastMessageId = Math.max(lastMessageId, messages[messages.length - 1].id);
  }
  renderMessages(messages);
}

// Carrega status e mensagens em paralelo
async function refreshDashboard() {
  try {
    await Promise.all([loadStatus(), loadMessages()]);
  } catch (error) {
    setFeedback(error.message, true);
  }
}

// Listener para submissao do formulário de envio de mensagem
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  // Coleta dados do formulário
  const payload = {
    username: document.getElementById("username").value.trim(),
    room: document.getElementById("room").value.trim() || "geral",
    content: document.getElementById("content").value.trim()
  };

  // Valida campos obrigatorios
  if (!payload.username || !payload.content) {
    setFeedback("Informe usuario e mensagem antes de enviar.", true);
    return;
  }

  // Desabilita botao durante envio
  submitButton.disabled = true;
  setFeedback("Enviando mensagem para o gateway...");

  try {
    // Envia mensagem via API
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    // Se resposta nao foi OK, lança erro com mensagem do servidor
    if (!response.ok) {
      throw new Error(data.error || "Falha ao enviar a mensagem.");
    }

    // Limpa campo de entrada apos sucesso
    document.getElementById("content").value = "";
    // Mostra feedback diferente se foi aceita ou salva em modo degradado
    setFeedback(
      data.message.status === "pending_review"
        ? "Mensagem salva em modo degradado: moderacao indisponivel."
        : "Mensagem entregue com sucesso."
    );

    // Recarrega dashboard
    await refreshDashboard();
  } catch (error) {
    setFeedback(error.message, true);
  } finally {
    // Reabilita botao
    submitButton.disabled = false;
  }
});

// Carrega dashboard na primeira vez
refreshDashboard();
// Recarrega dashboard a cada 2,5 segundos
setInterval(refreshDashboard, 2500);
