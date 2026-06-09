require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const documentRoutes = require('./routes/documentRoutes');

const app = express();
const httpServer = http.createServer(app);

// Socket.io attached to the HTTP server so the same port serves REST + WS.
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Attach io to every request so controllers can emit events.
app.use((req, _res, next) => {
  req.io = io;
  next();
});

app.use('/api/documents', documentRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`[Socket] Disconnected: ${socket.id}`));
});

// Global error handler — keeps the API alive on unexpected throws.
// Must have 4 params so Express recognises it as an error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`[API] DocEngine-X running on port ${PORT}`);
});
