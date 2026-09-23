/**
 * BROADCAST BRILLIANCE — Director Bridge Server v0.1.1
 * + FFmpeg RTMP worker (test pattern / dry-run)
 */

const http = require('http');
const { authenticate } = require('./auth');
const { RoomManager } = require('./state');
const { handleMessage, send } = require('./handlers/messages');
const { acceptWebSocket } = require('./mini-ws');
const { FFmpegWorker } = require('./ffmpeg-worker');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const STATUS_INTERVAL_MS = Number(process.env.STATUS_INTERVAL_MS || 2000);
const ALLOWED = (process.env.ALLOWED_BROADCAST_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const rooms = new RoomManager();
const worker = new FFmpegWorker();

function syncWorkerToDefaultRoom() {
  const room = rooms.get('bb-local-broadcast');
  room.applyEncoderStatus(worker.status());
}

worker.on('start', () => {
  syncWorkerToDefaultRoom();
  const room = rooms.get('bb-local-broadcast');
  room.broadcast({ type: 'media.status', payload: room.statusPayload() });
});
worker.on('stop', () => {
  syncWorkerToDefaultRoom();
  const room = rooms.get('bb-local-broadcast');
  room.broadcast({ type: 'media.status', payload: room.statusPayload() });
});
worker.on('error', (err) => {
  console.error('[ffmpeg worker]', err);
  syncWorkerToDefaultRoom();
});

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'director-bridge',
        version: '0.1.1',
        encoder: worker.status(),
      })
    );
    return;
  }

  if (req.url?.startsWith('/api/v1/broadcasts/') && req.url.endsWith('/bridge')) {
    const broadcastId = req.url.split('/')[4];
    const room = rooms.get(broadcastId);
    room.applyEncoderStatus(worker.status());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        broadcastId,
        wsUrl: `ws://localhost:${PORT}/bridge`,
        mediaEngine: {
          connected: worker.isRunning(),
          pipeline: {
            webrtc: room.mediaStatus.pipeline.webrtc.state,
            compositor: room.mediaStatus.pipeline.compositor.state,
            encoder: room.mediaStatus.pipeline.encoder.state,
            rtmp: room.mediaStatus.pipeline.rtmp.state,
          },
        },
        destinations: room.mediaStatus.destinations,
      })
    );
    return;
  }

  if (req.url?.startsWith('/api/v1/broadcasts/') && req.url.endsWith('/media/status')) {
    const broadcastId = req.url.split('/')[4];
    const room = rooms.get(broadcastId);
    room.applyEncoderStatus(worker.status());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(room.statusPayload()));
    return;
  }

  // Simple REST destination control for testing without WS
  if (req.method === 'POST' && req.url === '/api/v1/encoder/start') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      let payload = {};
      try {
        payload = body ? JSON.parse(body) : {};
      } catch (_) {}
      const r = await worker.start(payload.destination || 'rtmp', payload);
      const room = rooms.get('bb-local-broadcast');
      room.applyEncoderStatus(worker.status());
      room.broadcast({ type: 'media.status', payload: room.statusPayload() });
      res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/v1/encoder/stop') {
    worker.stop().then((r) => {
      const room = rooms.get('bb-local-broadcast');
      room.applyEncoderStatus(worker.status());
      room.broadcast({ type: 'media.status', payload: room.statusPayload() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.on('upgrade', (req, socket, head) => {
  const auth = authenticate(req);
  if (!auth.ok) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  let broadcastId = 'bb-local-broadcast';
  try {
    const u = new URL(req.url, 'http://localhost');
    broadcastId = u.searchParams.get('broadcastId') || broadcastId;
  } catch (_) {}

  if (ALLOWED.length && !ALLOWED.includes(broadcastId)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const ws = acceptWebSocket(req, socket, head);
  if (!ws) return;

  const room = rooms.get(broadcastId);
  room.applyEncoderStatus(worker.status());
  room.addClient(ws);

  console.log(`[bridge] connect user=${auth.user.sub} role=${auth.user.role} room=${broadcastId}`);

  send(ws, { type: 'media.status', payload: room.statusPayload() });

  ws.on('message', (data) => {
    handleMessage(ws, room, data, auth.user, worker);
  });

  ws.on('close', () => {
    room.removeClient(ws);
    console.log(`[bridge] disconnect room=${broadcastId}`);
  });
});

setInterval(() => {
  for (const room of rooms.rooms.values()) {
    if (room.clients.size === 0) continue;
    room.applyEncoderStatus(worker.status());
    room.broadcast({ type: 'media.status', payload: room.statusPayload() });
  }
}, STATUS_INTERVAL_MS);

server.listen(PORT, HOST, () => {
  console.log(`Director Bridge v0.1.1 on http://${HOST}:${PORT}`);
  console.log(`  WS  ws://localhost:${PORT}/bridge?broadcastId=bb-local-broadcast`);
  console.log(`  GET http://localhost:${PORT}/health`);
  console.log(`  POST /api/v1/encoder/start | /api/v1/encoder/stop`);
  console.log(`  RTMP_URL set: ${!!process.env.RTMP_URL}  (else dry-run)`);
  console.log(`  WebRTC ingest: NOT CONNECTED (test pattern only)`);
});
