/**
 * Director Bridge Client (stub-capable)
 * Spec: docs/DIRECTOR_BRIDGE_API.md
 *
 * mode: 'stub'  — local simulated Bridge (default, no server required)
 * mode: 'live'  — real WebSocket when BRIDGE_WS_URL is set and reachable
 */
(function (global) {
  // Live server: set window.BRIDGE_WS_URL = 'ws://localhost:8787/bridge' before load
  // and window.BRIDGE_STUB_MODE = false
  const STUB_MODE = global.BRIDGE_STUB_MODE !== undefined ? !!global.BRIDGE_STUB_MODE : true;
  const BRIDGE_WS_URL = global.BRIDGE_WS_URL || '';

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  class DirectorBridgeClient {
    constructor(options = {}) {
      this.mode = options.mode || (BRIDGE_WS_URL && !STUB_MODE ? 'live' : 'stub');
      this.broadcastId = options.broadcastId || 'bb-local-broadcast';
      this.ws = null;
      this.connected = false;
      this.sequence = 0;
      this.listeners = { status: [], connection: [], ack: [], error: [] };
      this.lastStatus = this._defaultStatus();
      this._stubTimer = null;
    }

    _defaultStatus() {
      return {
        ts: new Date().toISOString(),
        connected: false,
        bridgeMode: this.mode,
        pipeline: {
          webrtc: { state: 'offline', publishers: 0 },
          compositor: { state: 'offline' },
          encoder: { state: 'offline', bitrateKbps: null, fps: null },
          rtmp: { state: 'offline' }
        },
        destinations: {
          youtube: { configured: true, streaming: false, health: 'idle', viewers: null },
          facebook: { configured: true, streaming: false, health: 'idle', viewers: null },
          rtmp: { configured: false, streaming: false, health: 'unconfigured', viewers: null }
        },
        recording: {
          program: { active: false, durationSec: 0 },
          iso: { active: false }
        },
        program: {
          layout: '2x2',
          slots: [],
          priority: 'PROGRAM',
          sequence: 0
        }
      };
    }

    on(event, fn) {
      if (this.listeners[event]) this.listeners[event].push(fn);
      return () => {
        this.listeners[event] = this.listeners[event].filter(f => f !== fn);
      };
    }

    _emit(event, data) {
      (this.listeners[event] || []).forEach(fn => {
        try { fn(data); } catch (e) { console.error(e); }
      });
    }

    async connect() {
      if (this.mode === 'stub') {
        return this._connectStub();
      }
      return this._connectLive();
    }

    _connectStub() {
      this.connected = true;
      this.lastStatus = this._defaultStatus();
      this.lastStatus.connected = true; // bridge control plane "up"
      this.lastStatus.bridgeMode = 'stub';
      // Pipeline still offline — honest
      this._emit('connection', { connected: true, mode: 'stub' });
      this._emit('status', this.lastStatus);

      // Periodic media.status heartbeat (stub)
      this._stubTimer = setInterval(() => {
        this.lastStatus.ts = new Date().toISOString();
        this._emit('status', this.lastStatus);
      }, 2000);

      // Simulated hello.ok
      this._emit('ack', {
        type: 'hello.ok',
        payload: {
          bridgeVersion: '0.1.0-stub',
          mediaEngine: {
            connected: false,
            webrtc: 'offline',
            compositor: 'offline',
            encoder: 'offline',
            rtmp: 'offline'
          },
          broadcastId: this.broadcastId
        }
      });

      return Promise.resolve({ mode: 'stub', connected: true });
    }

    _connectLive() {
      return new Promise((resolve, reject) => {
        try {
          const url = BRIDGE_WS_URL + (BRIDGE_WS_URL.includes('?') ? '&' : '?') +
            'broadcastId=' + encodeURIComponent(this.broadcastId);
          this.ws = new WebSocket(url);
          this.ws.onopen = () => {
            this.connected = true;
            this._emit('connection', { connected: true, mode: 'live' });
            this.send('hello', {
              clientVersion: '1.8.0',
              broadcastId: this.broadcastId,
              capabilities: ['local-canvas', 'local-recorder']
            });
            resolve({ mode: 'live', connected: true });
          };
          this.ws.onmessage = (ev) => this._onMessage(ev.data);
          this.ws.onclose = () => {
            this.connected = false;
            this._emit('connection', { connected: false, mode: 'live' });
          };
          this.ws.onerror = (err) => {
            this._emit('error', { code: 'WS_ERROR', message: String(err) });
            reject(err);
          };
        } catch (e) {
          reject(e);
        }
      });
    }

    _onMessage(raw) {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (msg.type === 'media.status') {
        this.lastStatus = msg.payload;
        this._emit('status', this.lastStatus);
      } else if (msg.type === 'ack' || msg.type === 'hello.ok') {
        this._emit('ack', msg);
      } else if (msg.type === 'nack' || msg.type === 'error') {
        this._emit('error', msg.payload || msg);
      }
    }

    disconnect() {
      if (this._stubTimer) clearInterval(this._stubTimer);
      if (this.ws) this.ws.close();
      this.connected = false;
      this._emit('connection', { connected: false, mode: this.mode });
    }

    send(type, payload) {
      const msg = { type, requestId: uuid(), payload: payload || {} };
      if (this.mode === 'stub') {
        return this._stubHandle(msg);
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
      return msg.requestId;
    }

    _stubHandle(msg) {
      const { type, requestId, payload } = msg;

      if (type === 'ping') {
        this._emit('ack', { type: 'pong', requestId, payload: { t: payload.t } });
        return requestId;
      }

      if (type === 'hello') {
        this._emit('ack', {
          type: 'hello.ok',
          requestId,
          payload: {
            bridgeVersion: '0.1.0-stub',
            mediaEngine: {
              connected: false,
              webrtc: 'offline',
              compositor: 'offline',
              encoder: 'offline',
              rtmp: 'offline'
            },
            broadcastId: this.broadcastId
          }
        });
        return requestId;
      }

      if (type === 'production.state' || type === 'take') {
        const seq = payload.sequence != null ? payload.sequence : ++this.sequence;
        if (payload.sequence != null) this.sequence = Math.max(this.sequence, payload.sequence);

        // Apply program view to status (still no real encoder)
        this.lastStatus.ts = new Date().toISOString();
        this.lastStatus.program = {
          layout: payload.layout || this.lastStatus.program.layout,
          slots: payload.programSlots || payload.programSlots || this.lastStatus.program.slots,
          priority: payload.priority || this.lastStatus.program.priority,
          sequence: seq
        };
        if (payload.priority) this.lastStatus.program.priority = payload.priority;
        if (payload.programSlots) this.lastStatus.program.slots = payload.programSlots;
        if (payload.layout) this.lastStatus.program.layout = payload.layout;

        // Stub never lies: encoder stays offline
        this.lastStatus.pipeline.encoder.state = 'offline';
        this.lastStatus.pipeline.rtmp.state = 'offline';
        this.lastStatus.destinations.youtube.streaming = false;
        this.lastStatus.destinations.facebook.streaming = false;

        this._emit('ack', {
          type: 'ack',
          requestId,
          payload: { ok: true, appliedSequence: seq }
        });
        this._emit('status', this.lastStatus);
        return requestId;
      }

      if (type === 'destination.control') {
        const dest = (payload && payload.destination) || 'rtmp';
        const action = (payload && payload.action) || 'start';
        if (action === 'start' || action === 'restart') {
          // Stub dry-run: simulate encoder live without real RTMP
          this.lastStatus.pipeline.encoder = { state: 'live', bitrateKbps: null, fps: 30, dryRun: true };
          this.lastStatus.pipeline.rtmp = { state: 'dry-run' };
          this.lastStatus.pipeline.compositor = { state: 'test-pattern' };
          ['youtube', 'facebook', 'rtmp'].forEach(k => {
            if (!this.lastStatus.destinations[k]) return;
            if (k === dest) {
              this.lastStatus.destinations[k] = { configured: true, streaming: false, health: 'dry-run', viewers: null };
            }
          });
          this.lastStatus.ts = new Date().toISOString();
          this._emit('ack', {
            type: 'ack',
            requestId,
            payload: { ok: true, dryRun: true, message: 'Stub dry-run encoder started for ' + dest }
          });
          this._emit('status', this.lastStatus);
        } else if (action === 'stop') {
          this.lastStatus.pipeline.encoder = { state: 'offline', bitrateKbps: null, fps: null };
          this.lastStatus.pipeline.rtmp = { state: 'offline' };
          this.lastStatus.pipeline.compositor = { state: 'offline' };
          Object.keys(this.lastStatus.destinations || {}).forEach(k => {
            this.lastStatus.destinations[k] = {
              configured: !!this.lastStatus.destinations[k].configured,
              streaming: false,
              health: 'idle',
              viewers: null
            };
          });
          this.lastStatus.ts = new Date().toISOString();
          this._emit('ack', {
            type: 'ack',
            requestId,
            payload: { ok: true, message: 'Stub encoder stopped' }
          });
          this._emit('status', this.lastStatus);
        } else {
          this._emit('ack', {
            type: 'nack',
            requestId,
            payload: { ok: false, code: 'INVALID_STATE', message: 'action must be start|stop|restart' }
          });
        }
        return requestId;
      }

      if (type === 'recording.control') {
        this._emit('ack', {
          type: 'nack',
          requestId,
          payload: {
            ok: false,
            code: 'ENCODER_OFFLINE',
            message: 'Stub Bridge: server recording unavailable. Use Local Record.'
          }
        });
        return requestId;
      }

      return requestId;
    }

    /** Build production state from app state and send */
    publishProductionState(appState) {
      this.sequence += 1;
      const payload = {
        schemaVersion: 1,
        broadcastId: this.broadcastId,
        updatedAt: new Date().toISOString(),
        sequence: this.sequence,
        priority: appState.priority || 'PROGRAM',
        hold: !!appState.hold,
        layout: appState.layout,
        programSlots: [...(appState.programSlots || [])],
        previewSlots: [...(appState.previewSlots || [])],
        transition: appState.transition || { type: 'CUT', durationMs: 0 },
        graphics: {
          lowerThird: {
            enabled: !!(appState.graphics && appState.graphics.lt && appState.graphics.lt.enabled),
            title: (appState.graphics && appState.graphics.lt && appState.graphics.lt.title) || '',
            subtitle: (appState.graphics && appState.graphics.lt && appState.graphics.lt.subtitle) || ''
          },
          breaking: {
            enabled: !!(appState.graphics && appState.graphics.bn && appState.graphics.bn.enabled),
            text: (appState.graphics && appState.graphics.bn && appState.graphics.bn.text) || ''
          },
          liveBug: !!(appState.graphics && appState.graphics.live && appState.graphics.live.enabled),
          logo: !!(appState.graphics && appState.graphics.logo && appState.graphics.logo.enabled)
        },
        destinations: {
          youtube: { enabled: false },
          facebook: { enabled: false },
          rtmp: { enabled: false }
        },
        recording: { program: false, iso: false }
      };
      return this.send('production.state', payload);
    }

    publishTake(appState, transition) {
      this.sequence += 1;
      return this.send('take', {
        sequence: this.sequence,
        layout: appState.layout,
        programSlots: [...(appState.programSlots || [])],
        priority: appState.priority || 'PROGRAM',
        transition: transition || { type: 'CUT', durationMs: 0 }
      });
    }

    getStatus() {
      return this.lastStatus;
    }
  }

  global.DirectorBridgeClient = DirectorBridgeClient;
})(typeof window !== 'undefined' ? window : globalThis);
