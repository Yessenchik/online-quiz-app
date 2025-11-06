require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const os = require('os');

const logger = require('./logger');
const { pool, query } = require('./db');
const roomRoutes = require('./routes/room');
const attachWebSocket = require('./websocket');

const app = express();
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0'; // bind to all interfaces for LAN access

// ---------- helpers ----------
function getLocalIPs() {
    const nets = os.networkInterfaces();
    const addrs = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
        }
    }
    return addrs;
}

// ---------- middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- static frontend ----------
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// root -> main.html
app.get('/', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'main.html'));
});

// ---------- APIs ----------
app.use('/api/room', roomRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/db-health', async (_req, res) => {
    try {
        const r = await query('SELECT 1 AS ok');
        res.json({ ok: r.rows[0].ok === 1 });
    } catch (e) {
        logger.error(`DB health check failed: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ---------- HTTP + WebSocket ----------
const server = http.createServer(app);
attachWebSocket(server);

// ---------- start ----------
server.listen(PORT, HOST, () => {
    const local = `http://localhost:${PORT}`;
    const lans = getLocalIPs().map(ip => `http://${ip}:${PORT}`);
    logger.info(`Server running:`);
    logger.info(`  Local:   ${local}`);
    if (lans.length) {
        logger.info(`  Network: ${lans.join(', ')}`);
        logger.info(`Open the Network URL on another device on the same Wi-Fi.`);
    } else {
        logger.info(`No LAN IPv4 detected. Are you on a network?`);
    }
});

// ---------- graceful shutdown ----------
process.on('SIGINT', async () => {
    try {
        logger.info('Shutting down...');
        await pool.end();
    } catch (e) {
        logger.error(`Error closing DB: ${e.message}`);
    } finally {
        server.close(() => {
            logger.info('Server stopped');
            process.exit(0);
        });
    }
});