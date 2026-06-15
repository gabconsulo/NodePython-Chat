# Deploy gratuito na nuvem (Render)

Este guia sobe os **3 microservicos** do chat no [Render](https://render.com) usando o plano **Free**, sem cartao de credito.

## O que sera criado

| Servico | Tecnologia | URL publica |
|---------|------------|-------------|
| `nodepython-gateway` | Node.js | Frontend + API (acesse esta) |
| `nodepython-chat` | Python | API do chat (interna ao sistema) |
| `nodepython-moderation` | Node.js | API de moderacao (interna ao sistema) |

A arquitetura distribuida e mantida: gateway chama chat, chat chama moderacao. No plano gratuito do Render, a comunicacao entre servicos usa as URLs publicas geradas automaticamente.

## Passo a passo

### 1. Subir as alteracoes para o GitHub

Certifique-se de que o repositorio contem o arquivo `render.yaml` na raiz e faca push para a branch `main`.

### 2. Criar conta no Render

1. Acesse [https://render.com](https://render.com)
2. Crie uma conta gratuita (pode usar login com GitHub)

### 3. Conectar o repositorio

1. No dashboard, clique em **Blueprints**
2. Clique em **New Blueprint Instance**
3. Conecte sua conta GitHub se ainda nao estiver conectada
4. Selecione o repositorio `gabconsulo/NodePython-Chat`
5. Render detecta o `render.yaml` e mostra os 3 servicos
6. Clique em **Apply**

O deploy leva cerca de 5–10 minutos na primeira vez (build de 3 imagens Docker).

### 4. Acessar o chat

Quando o deploy terminar, abra a URL do servico **`nodepython-gateway`** (algo como `https://nodepython-gateway-xxxx.onrender.com`).

Endpoints uteis:

- Frontend: `https://<gateway-url>/`
- Health: `https://<gateway-url>/health`
- Status distribuido: `https://<gateway-url>/api/status`

## Limitacoes do plano gratuito

- **Cold start**: apos ~15 min sem acesso, os servicos "dormem". A primeira requisicao pode levar 30–60 segundos.
- **Persistencia**: o SQLite usa `/tmp/chat.db` (ephemeral). Mensagens podem ser perdidas ao reiniciar o container. Para persistencia, e necessario plano pago com disco.
- **750 h/mes** por servico (suficiente para demo e apresentacao).

## Redeploy automatico

Cada push na branch `main` dispara novo deploy automaticamente (se configurado no Render).

## Alternativa local (Docker)

```bash
cp .env.example .env
docker compose up --build
```

Acesse [http://localhost:8080](http://localhost:8080).
