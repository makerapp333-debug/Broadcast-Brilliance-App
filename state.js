/**
 * In-memory broadcast state for Director Bridge v0.1
 * One process can host multiple broadcast rooms.
 */

function defaultMediaStatus(broadcastId) {
  return {
    ts: new Date().toISOString(),
    connected: true,
    bridgeMode: 'live',
    pipeline: {
      webrtc: { state: 'offline', publishers: 0 },
      compositor: { state: 'offline' },
      encoder: { state: 'offline', bitrateKbps: null, fps: null },
      rtmp: { state: 'offline' },
    },
    destinations: {
      youtube: { configured: false, streaming: false, health: 'unconfigured', viewers: null },
      facebook: { configured: false, streaming: false, health: 'unconfigured', viewers: null },
      rtmp: { configured: false, streaming: false, health: 'unconfigured', viewers: null },
    },
    recording: {
      program: { active: false, durationSec: 0 },
      iso: { active: false },
    },
    program: {
      layout: 'fullscreen',
      slots: [],
      priority: 'PROGRAM',
      sequence: 0,
    },
    broadcastId,
  };
}

function defaultProduction(broadcastId) {
  return {
    schemaVersion: 1,
    broadcastId,
    sequence: 0,
    priority: 'PROGRAM',
    hold: false,
    layout: 'fullscreen',
    programSlots: [],
    previewSlots: [],
    transition: { type: 'CUT', durationMs: 0 },
    graphics: {},
    destinations: {
      youtube: { enabled: false },
      facebook: { enabled: false },
      rtmp: { enabled: false },
    },
    recording: { program: false, iso: false },
    resumeSlots: null,
  };
}

class BroadcastRoom {
  constructor(broadcastId) {
    this.broadcastId = broadcastId;
    this.production = defaultProduction(broadcastId);
    this.mediaStatus = defaultMediaStatus(broadcastId);
    this.clients = new Set();
    this.sourceRegistry = new Map();
  }

  addClient(ws) {
    this.clients.add(ws);
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === 1) {
        try {
          ws.send(raw);
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  applyProduction(payload) {
    const seq = payload.sequence != null ? Number(payload.sequence) : this.production.sequence + 1;
    if (seq < this.production.sequence) {
      return { ok: false, code: 'STALE_SEQUENCE', message: `sequence ${seq} < current ${this.production.sequence}` };
    }

    if (payload.layout && payload.programSlots) {
      // soft validate slot count later; v0.1 accepts
    }

    this.production = {
      ...this.production,
      ...payload,
      sequence: seq,
      programSlots: payload.programSlots || this.production.programSlots,
      previewSlots: payload.previewSlots || this.production.previewSlots,
      layout: payload.layout || this.production.layout,
      priority: payload.priority || this.production.priority,
      hold: payload.hold != null ? payload.hold : this.production.hold,
      updatedAt: new Date().toISOString(),
    };

    // Mirror into media.status.program (encoder still offline in skeleton)
    this.mediaStatus.ts = new Date().toISOString();
    this.mediaStatus.program = {
      layout: this.production.layout,
      slots: [...this.production.programSlots],
      priority: this.production.priority,
      sequence: this.production.sequence,
    };

    // Priority side-effects (skeleton: status only; no FFmpeg yet)
    if (this.production.priority === 'EMERGENCY') {
      this.mediaStatus.pipeline.compositor.state = 'offline';
    }

    return { ok: true, appliedSequence: seq };
  }

  statusPayload() {
    this.mediaStatus.ts = new Date().toISOString();
    this.mediaStatus.broadcastId = this.broadcastId;
    return { ...this.mediaStatus };
  }

  applyEncoderStatus(enc) {
    // enc from FFmpegWorker.status()
    const live = enc.state === 'live';
    this.mediaStatus.pipeline.encoder = {
      state: enc.state,
      bitrateKbps: enc.bitrateKbps,
      fps: enc.fps,
      dryRun: !!enc.dryRun,
    };
    this.mediaStatus.pipeline.rtmp = {
      state: live ? (enc.dryRun ? 'dry-run' : 'live') : 'offline',
    };
    this.mediaStatus.pipeline.compositor = {
      state: live ? 'test-pattern' : 'offline',
    };
    const dest = enc.destination || 'rtmp';
    for (const k of ['youtube', 'facebook', 'rtmp']) {
      if (!this.mediaStatus.destinations[k]) continue;
      if (k === dest && live) {
        this.mediaStatus.destinations[k] = {
          configured: true,
          streaming: !enc.dryRun,
          health: enc.dryRun ? 'dry-run' : 'live',
          viewers: null,
        };
      } else if (k === dest && !live) {
        this.mediaStatus.destinations[k] = {
          ...this.mediaStatus.destinations[k],
          streaming: false,
          health: enc.state === 'error' ? 'error' : 'idle',
        };
      }
    }
    this.mediaStatus.ts = new Date().toISOString();
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  get(broadcastId) {
    if (!this.rooms.has(broadcastId)) {
      this.rooms.set(broadcastId, new BroadcastRoom(broadcastId));
    }
    return this.rooms.get(broadcastId);
  }
}

module.exports = { RoomManager, defaultMediaStatus };
