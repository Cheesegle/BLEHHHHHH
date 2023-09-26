const express = require('express');
const http = require('http'); // Import the built-in HTTP module
const path = require('path');
const socketIo = require('socket.io'); // Import Socket.io

const app = express();
const port = process.env.PORT || 3000;

// Create an HTTP server instance using Express app
const server = http.createServer(app);

// Attach Socket.io to the HTTP server
const io = socketIo(server);

// Serve static files from the public folder
app.use(express.static('public'));

// Define a route for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io server logic
const players = new Map(); // Store player positions

io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle player position updates
  socket.on('updatePosition', (playerPosition) => {
    // Store the player's position in the players map
    players.set(socket.id, playerPosition);

    // Broadcast the updated player position to all connected clients except the sender
    socket.broadcast.emit('updatePlayerPosition', {
      playerId: socket.id,
      playerPosition
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');

    // Remove the player's position from the players map when they disconnect
    players.delete(socket.id);

    // Notify other clients that a player has disconnected
    socket.broadcast.emit('playerDisconnected', socket.id);
  });

  // Send initial player positions to the connected client
  socket.emit('initialPlayerPositions', Array.from(players.entries()));
});


// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});