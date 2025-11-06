const { WebSocketServer } = require('ws');
const { query } = require('./db');
const logger = require('./logger');

module.exports = function attachWebSocket(server) {
    const wss = new WebSocketServer({ server });

    // roomId -> { sockets:Set, users: Map<ws,{id,username,ready:boolean}> }
    const rooms = Object.create(null);
    const getRoom = (id) => rooms[id] || (rooms[id] = { sockets: new Set(), users: new Map() });

    const listUsers = (id) => {
        const r = rooms[id]; if (!r) return [];
        return [...r.users.values()].map(u => ({ id: u.id, username: u.username, ready: !!u.ready }));
    };

    const broadcastState = (id) => {
        const r = rooms[id]; if (!r) return;
        const payload = JSON.stringify({ type: 'state', roomId: id, users: listUsers(id) });
        for (const s of r.sockets) if (s.readyState === s.OPEN) s.send(payload);
    };

    wss.on('connection', (ws) => {
        logger.info('WS connected');
        ws._roomId = null;

        ws.on('message', async (buf) => {
            let msg; try { msg = JSON.parse(String(buf)); } catch { return; }

            if (msg.type === 'join_room') {
                const roomId = String(msg.roomId || '').trim();
                const username = String(msg.username || '').trim().slice(0, 24);
                if (!/^\d{6}$/.test(roomId) || !username) {
                    ws.send(JSON.stringify({ type:'error', error:'Invalid room or username' }));
                    return;
                }

                const room = getRoom(roomId);
                room.sockets.add(ws);
                ws._roomId = roomId;

                try {
                    const q1 = await query(
                        'SELECT id FROM users WHERE room_id = $1 AND username = $2 LIMIT 1',
                        [roomId, username]
                    );
                    let uid;
                    if (q1.rowCount > 0) {
                        uid = q1.rows[0].id;
                    } else {
                        const q2 = await query(
                            'INSERT INTO users (username, room_id) VALUES ($1,$2) RETURNING id',
                            [username, roomId]
                        );
                        uid = q2.rows[0].id;
                    }
                    room.users.set(ws, { id: uid, username, ready: false });
                } catch (e) {
                    logger.error('join_room DB error:', e.message);
                    room.users.set(ws, { id: Math.floor(Math.random()*1e9), username, ready: false });
                }

                broadcastState(roomId);
                return;
            }

            if (msg.type === 'ready_toggle') {
                const roomId = ws._roomId;
                if (!roomId || !rooms[roomId]) return;
                const rec = rooms[roomId].users.get(ws);
                if (!rec) return;
                rec.ready = !!msg.ready; // update in-memory
                broadcastState(roomId);
                return;
            }

            logger.info('WS message:', JSON.stringify(msg));
        });

        ws.on('close', () => {
            const roomId = ws._roomId;
            logger.info('WS closed');
            if (!roomId || !rooms[roomId]) return;
            const r = rooms[roomId];
            r.users.delete(ws);
            r.sockets.delete(ws);
            if (r.sockets.size === 0) delete rooms[roomId];
            else broadcastState(roomId);
        });
    });
};