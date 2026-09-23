# BROADCAST BRILLIANCE — Director Bridge API Contract
**Version:** 0.1.0-draft  
**Status:** Planning / implementable  
**Depends on:** Program Engine (browser), ONE PROGRAM OUTPUT rule  
**Related:** Module 05 Media Engine, Module 11 Destinations

---

## 1. Purpose

The Director Bridge is the **only** control plane between:

- Studio UI / Program Engine (browser)
- Server Media Engine (WebRTC SFU, compositor, encoder, RTMP)

It:

1. Accepts authenticated production decisions (TAKE, layout, sources, priority, destinations)
2. Never trusts the client with stream keys
3. Reports honest media health back to the UI
4. Does not invent a second Program output

Until the Bridge confirms a healthy publish, the UI must show:

- `MEDIA ENGINE: NOT CONNECTED` or component-level offline states
- Destinations: Not streaming

---

## 2. Transport

| Channel | Use |
|---------|-----|
| **WebSocket** | Primary — production state, heartbeats, status push |
| **REST (HTTPS)** | Secondary — bootstrap, destination config (no secrets in responses), recordings list |

**Base URL (example):**

```
wss://media.broadcast-brilliance.example/bridge
https://media.broadcast-brilliance.example/api/v1
```

**WebSocket path:**

```
wss://…/bridge?broadcastId={id}&token={jwt}
```

---

## 3. Authentication

- Operator: Supabase JWT (or equivalent) in:
  - WebSocket query `token=` **or** header `Authorization: Bearer <jwt>`
  - REST: `Authorization: Bearer <jwt>`
- Roles allowed to drive Program: `owner`, `admin`, `producer`, `director`
- Guest tokens are **not** valid on the Bridge control plane (guests publish via SFU guest path only)

On auth failure: WebSocket close code `4401`, REST `401`.

---

## 4. Core production state schema

This is the canonical object the UI already approximates. The Bridge treats it as the source of truth for **what should be on Program**.

```json
{
  "schemaVersion": 1,
  "broadcastId": "uuid",
  "updatedAt": "2026-09-20T08:30:00.000Z",
  "updatedBy": "user_uuid",
  "sequence": 1042,

  "priority": "PROGRAM",
  "hold": false,

  "layout": "host-guest",
  "programSlots": ["cam1", "guest_g1"],
  "previewSlots": ["cam1", "guest_g1"],

  "transition": {
    "type": "CUT",
    "durationMs": 0
  },

  "graphics": {
    "lowerThird": { "enabled": true, "title": "…", "subtitle": "…" },
    "breaking": { "enabled": false, "text": "…" },
    "ticker": { "enabled": true, "text": "…" },
    "liveBug": true,
    "logo": true,
    "location": { "enabled": true, "text": "NAIROBI" }
  },

  "rundown": {
    "currentItemId": "item_2",
    "autoDirector": false
  },

  "destinations": {
    "youtube": { "enabled": false },
    "facebook": { "enabled": false },
    "rtmp": { "enabled": false, "profileId": null }
  },

  "recording": {
    "program": false,
    "iso": false
  }
}
```

### Field rules

| Field | Values / notes |
|-------|----------------|
| `priority` | `EMERGENCY` \| `BREAKING` \| `AD` \| `PROGRAM` \| `BACKGROUND` |
| `layout` | `fullscreen` \| `2way` \| `2x2` \| `host-guest` \| `pip` |
| `programSlots` / `previewSlots` | Ordered source IDs; length must match layout slot count |
| `sequence` | Monotonic per broadcast; Bridge ignores stale sequences |
| `transition.type` | `CUT` \| `FADE` \| `AUTO` \| `BLACK` |

### Source ID convention

| Pattern | Meaning |
|---------|---------|
| `cam1` … `cam6` | Studio camera slots |
| `guest_{id}` | Admitted guest |
| `remote_{id}` | Remote camera |
| `media_{id}` | VOD / package |
| `yt_{id}` | YouTube/network source (ingest path TBD) |
| `screen_{id}` | Screen share |

Bridge maps these to SFU track / publication IDs via a **source registry** (see §7).

---

## 5. WebSocket protocol

### 5.1 Client → Bridge

All messages:

```json
{
  "type": "string",
  "requestId": "uuid",
  "payload": {}
}
```

#### `hello`

```json
{
  "type": "hello",
  "requestId": "…",
  "payload": {
    "clientVersion": "1.8.0",
    "broadcastId": "uuid",
    "capabilities": ["local-canvas", "local-recorder"]
  }
}
```

#### `production.state`

Full or partial production state. Prefer full state on TAKE / layout / priority change.

```json
{
  "type": "production.state",
  "requestId": "…",
  "payload": { /* ProductionState §4 */ }
}
```

#### `take`

Explicit TAKE (may embed next program slots).

```json
{
  "type": "take",
  "requestId": "…",
  "payload": {
    "sequence": 1043,
    "layout": "host-guest",
    "programSlots": ["cam1", "guest_g1"],
    "transition": { "type": "CUT", "durationMs": 0 }
  }
}
```

#### `destination.control`

```json
{
  "type": "destination.control",
  "requestId": "…",
  "payload": {
    "destination": "youtube",
    "action": "start"
  }
}
```

`destination`: `youtube` | `facebook` | `rtmp`  
`action`: `start` | `stop` | `restart`

#### `recording.control`

```json
{
  "type": "recording.control",
  "requestId": "…",
  "payload": {
    "target": "program",
    "action": "start"
  }
}
```

`target`: `program` | `iso`  
`action`: `start` | `stop`

#### `ping`

```json
{ "type": "ping", "requestId": "…", "payload": { "t": 1710000000000 } }
```

---

### 5.2 Bridge → Client

#### `hello.ok`

```json
{
  "type": "hello.ok",
  "requestId": "…",
  "payload": {
    "bridgeVersion": "0.1.0",
    "mediaEngine": {
      "connected": false,
      "webrtc": "offline",
      "compositor": "offline",
      "encoder": "offline",
      "rtmp": "offline"
    },
    "broadcastId": "uuid"
  }
}
```

#### `ack`

```json
{
  "type": "ack",
  "requestId": "…",
  "payload": {
    "ok": true,
    "appliedSequence": 1043
  }
}
```

#### `nack`

```json
{
  "type": "nack",
  "requestId": "…",
  "payload": {
    "ok": false,
    "code": "STALE_SEQUENCE",
    "message": "sequence 1040 < current 1042"
  }
}
```

#### `media.status` (push, periodic + on change)

```json
{
  "type": "media.status",
  "payload": {
    "ts": "2026-09-20T08:30:05.000Z",
    "connected": false,
    "pipeline": {
      "webrtc": { "state": "offline", "publishers": 0 },
      "compositor": { "state": "offline" },
      "encoder": { "state": "offline", "bitrateKbps": null, "fps": null },
      "rtmp": { "state": "offline" }
    },
    "destinations": {
      "youtube": { "configured": true, "streaming": false, "health": "idle", "viewers": null },
      "facebook": { "configured": true, "streaming": false, "health": "idle", "viewers": null },
      "rtmp": { "configured": false, "streaming": false, "health": "unconfigured", "viewers": null }
    },
    "recording": {
      "program": { "active": false, "durationSec": 0 },
      "iso": { "active": false }
    },
    "program": {
      "layout": "host-guest",
      "slots": ["cam1", "guest_g1"],
      "priority": "PROGRAM",
      "sequence": 1042
    }
  }
}
```

#### `error`

```json
{
  "type": "error",
  "payload": {
    "code": "ENCODER_FAILED",
    "message": "FFmpeg exited with code 1",
    "fatal": false
  }
}
```

#### `pong`

```json
{ "type": "pong", "requestId": "…", "payload": { "t": 1710000000000 } }
```

---

## 6. REST API (v1)

Base: `https://…/api/v1`

### 6.1 Bootstrap

#### `GET /broadcasts/{broadcastId}/bridge`

Returns non-secret bootstrap for UI.

**200**

```json
{
  "broadcastId": "uuid",
  "wsUrl": "wss://…/bridge",
  "mediaEngine": {
    "connected": false,
    "pipeline": {
      "webrtc": "offline",
      "compositor": "offline",
      "encoder": "offline",
      "rtmp": "offline"
    }
  },
  "destinations": {
    "youtube": { "configured": true, "label": "News Room TV" },
    "facebook": { "configured": true, "label": "News Room FB" },
    "rtmp": { "configured": false }
  }
}
```

Stream keys are **never** returned.

### 6.2 Destination configuration (admin)

#### `PUT /broadcasts/{broadcastId}/destinations/{name}`

Body (server stores secrets; response redacts them):

```json
{
  "enabled": true,
  "streamUrl": "rtmps://…",
  "streamKey": "secret"
}
```

**200** — same shape as bootstrap destination entry (no key).

#### `DELETE /broadcasts/{broadcastId}/destinations/{name}`

Removes config / disables.

### 6.3 Status snapshot

#### `GET /broadcasts/{broadcastId}/media/status`

Same payload as WebSocket `media.status`.

### 6.4 Recordings

#### `GET /broadcasts/{broadcastId}/recordings`

```json
{
  "items": [
    {
      "id": "rec_…",
      "type": "program",
      "startedAt": "…",
      "endedAt": "…",
      "durationSec": 3600,
      "sizeBytes": 123456789,
      "url": "https://storage/…/signed"
    }
  ]
}
```

---

## 7. Source registry

Bridge maintains mapping from logical source IDs → media handles.

```json
{
  "cam1": {
    "kind": "webrtc",
    "roomId": "broadcast_uuid",
    "participantId": "operator_1",
    "trackSid": "TR_xxx",
    "label": "Camera 1 (Local)"
  },
  "guest_g1": {
    "kind": "webrtc",
    "roomId": "broadcast_uuid",
    "participantId": "guest_g1",
    "trackSid": "TR_yyy",
    "label": "Dr. Amina Hassan"
  }
}
```

- Updated when publishers join/leave SFU  
- UI may send `source.announce` later; v0.1 can rely on SFU webhooks + naming convention  
- Unresolved `programSlots` IDs → encoder shows slate / holds last good frame (policy TBD)

---

## 8. Priority behaviour (Bridge)

When `priority` changes:

| Priority | Bridge action |
|----------|----------------|
| `EMERGENCY` | Force black or emergency slate on encode; pause normal Program mix; keep destinations up unless policy says cut |
| `BREAKING` | Prefer breaking graphic/source policy; do not drop destinations |
| `AD` | Switch to ad media source if registered |
| `PROGRAM` | Resume `programSlots` + layout |
| `BACKGROUND` | Idle / standby slate |

Resume uses last non-override `programSlots` stored by Bridge (mirrors UI resume state).

---

## 9. Error codes

| Code | Meaning |
|------|---------|
| `UNAUTHORIZED` | Bad/missing JWT |
| `FORBIDDEN` | Role cannot control Program |
| `STALE_SEQUENCE` | Client sequence behind Bridge |
| `INVALID_STATE` | Schema / layout slot mismatch |
| `SOURCE_UNAVAILABLE` | programSlots ID not in registry |
| `ENCODER_OFFLINE` | Cannot start destination |
| `ENCODER_FAILED` | Encode process died |
| `DEST_NOT_CONFIGURED` | Missing stream config |
| `DEST_FAILED` | RTMP publish failed |
| `RATE_LIMITED` | Too many control messages |

---

## 10. UI obligations (Broadcast Brilliance client)

1. On `hello.ok` / `media.status`, drive badges from **server** state, not local optimism.  
2. Show **Encoder: OFFLINE** and **Not streaming** until `pipeline.encoder.state === "live"` and destination `streaming === true`.  
3. Send `production.state` or `take` on every TAKE, layout change, and priority change.  
4. Increment `sequence` on every production mutation.  
5. Local canvas + MediaRecorder may continue as operator confidence path; they must not set destination status to live.  
6. Never request or display stream keys.

---

## 11. Sequence & conflict

- Single active director recommended for v0.1.  
- If two clients send states, highest `sequence` wins; lower → `nack` `STALE_SEQUENCE`.  
- Bridge broadcasts `media.status` with applied `program.sequence` so UIs can resync.

---

## 12. Out of scope for v0.1

- Server-side graphics burn-in (flags only)  
- Multi-bitrate ABR ladder  
- Automatic destination failover  
- Full ISO per-source recording UI  
- Guest payment / token issuance (Guest Platform owns that)

---

## 13. Implementation checklist (M5a → M5b)

- [ ] Bridge service: WS + JWT verify  
- [ ] `hello` / `production.state` / `take` / `ack` / `nack`  
- [ ] `media.status` heartbeat (1–2s) with all offline defaults  
- [ ] Source registry stub (manual map for cam1)  
- [ ] LiveKit room join (operator + one guest)  
- [ ] FFmpeg RTMP worker start/stop from `destination.control`  
- [ ] Wire UI: connect WS, send TAKE state, render server status pills  
- [ ] Keep UI honest until encoder reports live  

---

## 14. Example TAKE flow

```
UI: user hits TAKE
UI: sequence++, programSlots = previewSlots
UI: → WS take { sequence, layout, programSlots, transition: CUT }
Bridge: validate JWT, sequence, sources
Bridge: update mix / encoder graph
Bridge: → ack { appliedSequence }
Bridge: → media.status { program.slots, encoder state, … }
UI: update On Air labels from media.status (not only local state)
```

---

**Document owner:** Broadcast Brilliance Media Engine  
**Next artifact:** Phase M5a task breakdown (repo layout, env vars, LiveKit room model) if required.
