const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Configuração do servidor Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos da pasta "public"
app.use(express.static('public'));

// Quando um cliente se conecta
io.on('connection', (socket) => {
  console.log('Novo usuário conectado');

  // Escuta mensagens de chat
  socket.on('chat message', (msg) => {
    // Envia a mensagem para todos os clientes conectados
    io.emit('chat message', msg);
  });

  // Quando um cliente se desconecta
  socket.on('disconnect', () => {
    console.log('Usuário desconectado');
  });
});

// Iniciar o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
