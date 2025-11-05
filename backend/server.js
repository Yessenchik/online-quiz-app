// server.js
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { query, pool } = require('./db');

const PORT = process.env.PORT || 8000;
const app = express();
app.use(express.json());

// ---------- Static frontend (parallel folder) ----------
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// Root opens main.html
app.get('/', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'main.html'));
});

// Optional friendly routes
app.get('/main',   (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'main.html')));
app.get('/room',   (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'room.html')));
app.get('/test',   (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'test.html')));
app.get('/result', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'result.html')));

// ---------- Health ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/db-health', async (_req, res) => {
    try {
        const r = await query('SELECT 1 AS ok');
        res.json({ ok: r.rows[0].ok === 1 });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ---------- In-memory rooms ----------
/** rooms: { [roomId]: Map<ws, { username, score }> } */
const rooms = {};
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(roomId, payload) {
    const room = rooms[roomId];
    if (!room) return;
    const msg = JSON.stringify(payload);
    for (const sock of room.keys()) if (sock.readyState === sock.OPEN) sock.send(msg);
}
function send(ws, type, data = {}) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...data }));
}
function roomSnapshot(roomId) {
    const room = rooms[roomId];
    if (!room) return [];
    return [...room.values()].map(u => ({ username: u.username, score: u.score }));
}
function genRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ---------- WebSocket ----------
wss.on('connection', (ws) => {
    ws.meta = { roomId: null, username: null };
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
        let data; try { data = JSON.parse(raw); } catch { return send(ws, 'error', { message: 'Invalid JSON' }); }
        const { type } = data;

        if (type === 'create_room') {
            const roomId = genRoomId();
            rooms[roomId] = new Map();
            return send(ws, 'room_created', { roomId });
        }

        if (type === 'join_room') {
            const { roomId, username } = data;
            if (!roomId || !username) return send(ws, 'error', { message: 'roomId and username required' });
            if (!rooms[roomId]) rooms[roomId] = new Map();
            rooms[roomId].set(ws, { username, score: 0 });
            ws.meta = { roomId, username };
            send(ws, 'joined', { roomId, users: roomSnapshot(roomId) });
            return broadcast(roomId, { type: 'user_joined', user: { username, score: 0 }, users: roomSnapshot(roomId) });
        }

        if (type === 'start_quiz') {
            const { roomId } = ws.meta;
            if (!roomId) return send(ws, 'error', { message: 'Join a room first' });
            return broadcast(roomId, { type: 'quiz_started' });
        }

        if (type === 'answer') {
            const { roomId, username } = ws.meta;
            if (!roomId) return send(ws, 'error', { message: 'Join a room first' });
            const { questionId, isCorrect } = data;
            const room = rooms[roomId]; if (!room) return;
            const user = room.get(ws); if (!user) return;
            if (isCorrect) user.score += 100;

            try {
                await query(
                    `INSERT INTO attempts(room_id, username, question_id, correct, created_at)
                     VALUES ($1,$2,$3,$4,NOW())`,
                    [roomId, username, questionId ?? null, !!isCorrect]
                );
            } catch (e) { console.error('DB insert attempt error:', e.message); }

            return broadcast(roomId, { type: 'score_update', users: roomSnapshot(roomId) });
        }

        if (type === 'leave_room') {
            const { roomId } = ws.meta;
            if (!roomId || !rooms[roomId]) return;
            const leftUser = rooms[roomId].get(ws);
            rooms[roomId].delete(ws);
            ws.meta = { roomId: null, username: null };
            return broadcast(roomId, { type: 'user_left', user: leftUser?.username, users: roomSnapshot(roomId) });
        }

        return send(ws, 'error', { message: `Unknown type: ${type}` });
    });

    ws.on('close', () => {
        const { roomId } = ws.meta || {};
        if (!roomId || !rooms[roomId]) return;
        const leftUser = rooms[roomId].get(ws);
        rooms[roomId].delete(ws);
        broadcast(roomId, { type: 'user_left', user: leftUser?.username, users: roomSnapshot(roomId) });
    });
});

// Keep connections healthy
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false; ws.ping();
    });
}, 30000);
wss.on('close', () => clearInterval(interval));

// ---------- Start ----------
server.listen(PORT, () => {
    console.log(`HTTP + WS server running at http://localhost:${PORT}`);
});

// ---------- Graceful shutdown ----------
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await pool.end().catch(() => {});
    server.close(() => process.exit(0));
});