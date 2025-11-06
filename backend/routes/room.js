const express = require('express');
const router = express.Router();
const { query } = require('../db');
const logger = require('../logger');

// -------- helpers --------
function generateRoomCode() {
    const d1 = Math.floor(Math.random() * 10);
    const d2 = Math.floor(Math.random() * 10);
    const first = `${d1}${d1}${Math.floor(Math.random() * 10)}`;
    const second = `${d2}${d2}${Math.floor(Math.random() * 10)}`;
    return first + second; // e.g. 442333
}

// -------- routes --------

// POST /api/room/create  { username }
router.post('/create', async (req, res) => {
    const { username } = req.body || {};
    const name = String(username || '').trim();
    if (!name) return res.status(400).json({ ok:false, error:'Username is required' });

    try {
        // find a free code
        let code, exists = true;
        while (exists) {
            code = generateRoomCode();
            const r = await query('SELECT 1 FROM users WHERE room_id = $1 LIMIT 1', [code]);
            exists = r.rowCount > 0;
        }

        const ins = await query(
            'INSERT INTO users (username, room_id) VALUES ($1,$2) RETURNING id, username, room_id, test_id',
            [name, code]
        );

        logger.info(`Room created with code: ${code} by user: ${name}`);
        return res.status(201).json({ ok:true, roomCode: code, user: ins.rows[0] });
    } catch (e) {
        logger.error(`Error creating room: ${e.message}`);
        return res.status(500).json({ ok:false, error:'Error creating room' });
    }
});

// GET /api/room/:roomCode
router.get('/:roomCode', async (req, res) => {
    const code = String(req.params.roomCode || '').trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok:false, error:'Invalid room code' });

    try {
        const r = await query(
            'SELECT id, username, room_id, test_id FROM users WHERE room_id = $1 ORDER BY id',
            [code]
        );
        if (r.rowCount === 0) return res.status(404).json({ ok:false, error:'Room not found' });

        logger.info(`Room details fetched for code: ${code}`);
        return res.json({ ok:true, roomId: code, users: r.rows });
    } catch (e) {
        logger.error(`Fetch room error: ${e.message}`);
        return res.status(500).json({ ok:false, error:'Error fetching room details' });
    }
});

// POST /api/room/join   { roomCode, username }
// App-level duplicate prevention: insert only if not exists (room_id, username)
router.post('/join', async (req, res) => {
    const { roomCode, username } = req.body || {};
    const code = String(roomCode || '').trim();
    const name = String(username || '').trim();

    if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok:false, error:'Invalid room code' });
    if (!name) return res.status(400).json({ ok:false, error:'Username is required' });

    try {
        // check that room exists (at least one user)
        const roomCheck = await query('SELECT 1 FROM users WHERE room_id = $1 LIMIT 1', [code]);
        if (roomCheck.rowCount === 0) return res.status(404).json({ ok:false, error:'Room not found' });

        // if user exists in this room → return it
        const q1 = await query(
            'SELECT id, username, room_id, test_id FROM users WHERE room_id = $1 AND username = $2 LIMIT 1',
            [code, name]
        );
        if (q1.rowCount > 0) return res.json({ ok:true, created:false, user:q1.rows[0] });

        // else insert
        const q2 = await query(
            'INSERT INTO users (username, room_id) VALUES ($1,$2) RETURNING id, username, room_id, test_id',
            [name, code]
        );
        return res.json({ ok:true, created:true, user:q2.rows[0] });
    } catch (e) {
        logger.error(`Join error: ${e.message}`);
        return res.status(500).json({ ok:false, error:'Join failed' });
    }
});

// DELETE /api/room/leave/:roomCode   { username }
router.delete('/leave/:roomCode', async (req, res) => {
    const code = String(req.params.roomCode || '').trim();
    const name = String((req.body && req.body.username) || '').trim();

    if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok:false, error:'Invalid room code' });
    if (!name) return res.status(400).json({ ok:false, error:'Username is required' });

    try {
        const del = await query('DELETE FROM users WHERE room_id = $1 AND username = $2', [code, name]);
        if (del.rowCount === 0) return res.status(404).json({ ok:false, error:'User not found in room' });
        logger.info(`User ${name} left room ${code}`);
        return res.json({ ok:true });
    } catch (e) {
        logger.error(`Leave error: ${e.message}`);
        return res.status(500).json({ ok:false, error:'Leave failed' });
    }
});

module.exports = router;