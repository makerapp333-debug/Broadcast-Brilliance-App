/**
 * WebSocket message handlers — DIRECTOR_BRIDGE_API.md v0.1 + FFmpeg worker
 */

function rid() {
  return 'req_' + Math.random().toString(36).slice(2, 10);
}

function send(ws, msg) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * @param {import('../ffmpeg-worker').FFmpegWorker} [worker]
 */
function handleMessage(ws, room, raw, user, worker) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: 'error', payload: { code: 'INVALID_STATE', message: 'Malformed JSON', fatal: false } });
    return;
  }

  const { type, requestId = rid(), payload = {} } = msg;

  switch (type) {
    case 'hello': {
      send(ws, {
        type: 'hello.ok',
        requestId,
        payload: {
          bridgeVersion: '0.1.0',
          mediaEngine: {
            connected: !!(worker && worker.isRunning()),
            webrtc: room.mediaStatus.pipeline.webrtc.state,
            compositor: room.mediaStatus.pipeline.compositor.state,
            encoder: room.mediaStatus.pipeline.encoder.state,
            rtmp: room.mediaStatus.pipeline.rtmp.state,
          },
          broadcastId: room.broadcastId,
          user: { sub: user.sub, role: user.role },
        },
      });
      send(ws, { type: 'media.status', payload: room.statusPayload() });
      break;
    }
    case 'ping': {
      send(ws, { type: 'pong', requestId, payload: { t: payload.t || Date.now() } });
      break;
    }
    case 'production.state':
    case 'take': {
      const result = room.applyProduction({
        ...payload,
        priority: payload.priority || room.production.priority,
        layout: payload.layout || room.production.layout,
        programSlots: payload.programSlots || room.production.programSlots,
      });
      if (!result.ok) {
        send(ws, {
          type: 'nack',
          requestId,
          payload: { ok: false, code: result.code, message: result.message },
        });
        break;
      }
      send(ws, {
        type: 'ack',
        requestId,
        payload: { ok: true, appliedSequence: result.appliedSequence },
      });
      room.broadcast({ type: 'media.status', payload: room.statusPayload() });
      break;
    }
    case 'destination.control': {
      const dest = payload.destination || 'rtmp';
      const action = payload.action || 'start';
      if (!worker) {
        send(ws, {
          type: 'nack',
          requestId,
          payload: { ok: false, code: 'ENCODER_OFFLINE', message: 'FFmpeg worker not attached' },
        });
        break;
      }
      (async () => {
        if (action === 'start' || action === 'restart') {
          if (action === 'restart') await worker.stop();
          const r = await worker.start(dest, {
            rtmpUrl: payload.streamUrl,
            rtmpKey: payload.streamKey,
          });
          room.applyEncoderStatus(worker.status());
          if (!r.ok) {
            send(ws, {
              type: 'nack',
              requestId,
              payload: { ok: false, code: r.code || 'ENCODER_FAILED', message: r.message },
            });
          } else {
            send(ws, {
              type: 'ack',
              requestId,
              payload: {
                ok: true,
                dryRun: !!r.dryRun,
                message: r.message || (r.dryRun ? 'Dry-run encoder started' : 'Encoder started'),
                appliedSequence: room.production.sequence,
              },
            });
          }
          room.broadcast({ type: 'media.status', payload: room.statusPayload() });
        } else if (action === 'stop') {
          await worker.stop();
          room.applyEncoderStatus(worker.status());
          send(ws, {
            type: 'ack',
            requestId,
            payload: { ok: true, message: 'Encoder stopped' },
          });
          room.broadcast({ type: 'media.status', payload: room.statusPayload() });
        } else {
          send(ws, {
            type: 'nack',
            requestId,
            payload: { ok: false, code: 'INVALID_STATE', message: 'action must be start|stop|restart' },
          });
        }
      })().catch((e) => {
        send(ws, {
          type: 'nack',
          requestId,
          payload: { ok: false, code: 'ENCODER_FAILED', message: String(e.message || e) },
        });
      });
      break;
    }
    case 'recording.control': {
      send(ws, {
        type: 'nack',
        requestId,
        payload: {
          ok: false,
          code: 'ENCODER_OFFLINE',
          message: 'Server recording not available yet. Use Local Record in UI.',
        },
      });
      break;
    }
    default: {
      send(ws, {
        type: 'error',
        payload: { code: 'INVALID_STATE', message: `Unknown type: ${type}`, fatal: false },
      });
    }
  }
}

module.exports = { handleMessage, send };
