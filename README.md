# Director Bridge Server (skeleton v0.1.0)

Control plane between Studio UI and the future Media Engine.

**Spec:** [`../docs/DIRECTOR_BRIDGE_API.md`](../docs/DIRECTOR_BRIDGE_API.md)

## Run (no npm install required)

```bash
cd server
node src/index.js
```

- Health: `http://localhost:8787/health`
- WebSocket: `ws://localhost:8787/bridge?broadcastId=bb-local-broadcast`

## Point the UI at this server

Before loading the studio (or in console then reload client logic):

```js
window.BRIDGE_WS_URL = 'ws://localhost:8787/bridge';
window.BRIDGE_STUB_MODE = false;
```

Then ensure `bridge.js` is loaded and the app connects.

## Implemented

| Message | Behaviour |
|---------|-----------|
| `hello` | `hello.ok` + `media.status` |
| `production.state` / `take` | Apply sequence, ack, fan-out status |
| `destination.control` | `nack` ENCODER_OFFLINE |
| `recording.control` | `nack` ENCODER_OFFLINE |
| `ping` | `pong` |
| Heartbeat | `media.status` every 2s |

Pipeline WebRTC / Encoder / RTMP remain **offline** until M5b.

## Auth

- No `JWT_SECRET` → DEV_AUTH_OPEN (any connection as director)
- Set `JWT_SECRET` for HS256 verification

## Next (M5b)

LiveKit source registry + FFmpeg RTMP worker; only then set `pipeline.encoder.state = live`.
