const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*", // Use environment variable for production
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e7 // 10 MB
});

const PORT = process.env.PORT || 5000; // Use environment variable for port

const onlineUsers = {};

// Helper: get socket id by username
function getSocketIdByUsername(username) {
  return Object.keys(onlineUsers).find(id => onlineUsers[id] === username);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Listen for username registration
  socket.on('register', (username) => {
    onlineUsers[socket.id] = username;
    // Notify all clients about the updated online users
    io.emit('online users', Object.values(onlineUsers));
    console.log(`User registered: ${username} (${socket.id})`);
  });

  // Listen for chat messages from this client
  socket.on('chat message', (msg) => {
    const username = onlineUsers[socket.id] || 'Anonymous';
    const messageData = {
      id: socket.id,
      username,
      message: msg,
      timestamp: new Date().toISOString()
    };
    // Broadcast the message to all clients (including sender)
    io.emit('chat message', messageData);
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    const username = onlineUsers[socket.id] || 'Anonymous';
    io.emit('typing', { id: socket.id, username, isTyping });
  });

  // Join a chat room
  socket.on('join room', (room) => {
    socket.join(room);
    socket.emit('joined room', room);
    // Optionally notify others in the room
    socket.to(room).emit('room notification', `${onlineUsers[socket.id] || 'Anonymous'} joined ${room}`);
  });

  // Leave a chat room
  socket.on('leave room', (room) => {
    socket.leave(room);
    socket.emit('left room', room);
    socket.to(room).emit('room notification', `${onlineUsers[socket.id] || 'Anonymous'} left ${room}`);
  });

  // Send a message to a specific room
  socket.on('room message', ({ room, message }) => {
    const username = onlineUsers[socket.id] || 'Anonymous';
    const messageData = {
      id: socket.id,
      username,
      room,
      message,
      timestamp: new Date().toISOString()
    };
    io.to(room).emit('room message', messageData);
  });

  // Private messaging
  socket.on('private message', ({ toUsername, message }) => {
    const toSocketId = getSocketIdByUsername(toUsername);
    const username = onlineUsers[socket.id] || 'Anonymous';
    if (toSocketId) {
      const messageData = {
        from: username,
        to: toUsername,
        message,
        timestamp: new Date().toISOString()
      };
      io.to(toSocketId).emit('private message', messageData);
      // Optionally, also send to sender for their chat window
      socket.emit('private message', messageData);
    } else {
      socket.emit('private message error', `User ${toUsername} not found or offline.`);
    }
  });

  // File/Image sharing (base64 or URL)
  socket.on('file message', ({ room, toUsername, file, fileType, caption }) => {
    const username = onlineUsers[socket.id] || 'Anonymous';
    const messageData = {
      id: socket.id,
      username,
      room: room || null,
      to: toUsername || null,
      file, // base64 string or URL
      fileType, // e.g., 'image/png', 'application/pdf'
      caption: caption || '',
      timestamp: new Date().toISOString(),
      type: 'file'
    };
    if (room) {
      io.to(room).emit('file message', messageData);
    } else if (toUsername) {
      const toSocketId = getSocketIdByUsername(toUsername);
      if (toSocketId) {
        io.to(toSocketId).emit('file message', messageData);
        socket.emit('file message', messageData);
      } else {
        socket.emit('file message error', `User ${toUsername} not found or offline.`);
      }
    } else {
      io.emit('file message', messageData);
    }
  });

  // Read receipts
  socket.on('message read', ({ messageId, fromUsername, room }) => {
    // Notify the sender that their message was read
    const fromSocketId = getSocketIdByUsername(fromUsername);
    if (fromSocketId) {
      io.to(fromSocketId).emit('message read', {
        messageId,
        reader: onlineUsers[socket.id] || 'Anonymous',
        room: room || null,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Message reactions
  socket.on('message reaction', ({ messageId, reaction, room, toUsername }) => {
    const username = onlineUsers[socket.id] || 'Anonymous';
    const reactionData = {
      messageId,
      reaction,
      from: username,
      room: room || null,
      to: toUsername || null,
      timestamp: new Date().toISOString()
    };
    if (room) {
      io.to(room).emit('message reaction', reactionData);
    } else if (toUsername) {
      const toSocketId = getSocketIdByUsername(toUsername);
      if (toSocketId) {
        io.to(toSocketId).emit('message reaction', reactionData);
        socket.emit('message reaction', reactionData);
      }
    } else {
      io.emit('message reaction', reactionData);
    }
  });

  socket.on('disconnect', () => {
    const username = onlineUsers[socket.id];
    if (username) {
      delete onlineUsers[socket.id];
      // Notify all clients about the updated online users
      io.emit('online users', Object.values(onlineUsers));
      console.log(`User disconnected: ${username} (${socket.id})`);
    } else {
      console.log(`User disconnected: ${socket.id}`);
    }
  });
});

app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running!');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 