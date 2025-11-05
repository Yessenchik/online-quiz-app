const ws = new WebSocket(`ws://${location.host}`);

ws.addEventListener('open', () => {
    // Create or join a room
    // ws.send(JSON.stringify({ type: 'create_room' }));
    // or:
    // ws.send(JSON.stringify({ type: 'join_room', roomId: 'ABC123', username: 'Ilyas' }));
});

ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    console.log('WS:', msg);
    // handle: room_created, joined, user_joined, quiz_started, score_update, user_left, error
});