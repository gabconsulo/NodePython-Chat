const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Configurando o server express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos da pasta "public"
app.use(express.static('public'));

// Quando um cliente se conecta
io.on('connection', (socket) => {
  console.log('Novo usuário conectado');

  // Recebe a mensagem
  socket.on('chat message', (msg) => {
    // Envia a todos conectados ao chat
    io.emit('chat message', msg);
  });

  // Mensagem de usuario desconectado
  socket.on('disconnect', () => {
    console.log('Usuário desconectado');
  });
});

// Configurando a porta e o iniciando o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
