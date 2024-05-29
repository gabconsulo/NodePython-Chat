const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');

// Configurando o servidor express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos da pasta "public"
app.use(express.static('public'));

// Configurar chave de criptografia (deve ser compartilhada com o cliente de forma segura)
const secretKey = '12345678901234567890123456789012'; // Chave secreta de exemplo
const iv = Buffer.from('1234567890123456'); // IV de exemplo; deve ter 16 bytes

// Funções para criptografar e descriptografar
function encrypt(text) {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(text) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secretKey), iv);
  let decrypted = decipher.update(text, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Quando um cliente se conecta
io.on('connection', (socket) => {
  console.log('Novo usuário conectado');

  // Recebe a mensagem
  socket.on('chat message', (msg) => {
    // Descriptografa a mensagem recebida
    try {
      const decryptedMessage = decrypt(msg.message);
      console.log(`Mensagem recebida de ${msg.username}: ${decryptedMessage}`);
      
      // Reemite a mensagem criptografada
      io.emit('chat message', msg);
    } catch (error) {
      console.error('Erro ao descriptografar a mensagem:', error.message);
    }
  });

  // Mensagem de usuário desconectado
  socket.on('disconnect', () => {
    console.log('Usuário desconectado');
  });
});

// Configurando a porta e iniciando o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
