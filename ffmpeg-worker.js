/**
 * FFmpeg RTMP worker (M5b skeleton)
 *
 * Until WebRTC ingest exists, publishes a test pattern (or env RTMP_TEST_INPUT).
 * Set RTMP_URL + RTMP_KEY to actually publish. Otherwise dry-run status only.
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class FFmpegWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.proc = null;
    this.startedAt = null;
    this.lastError = null;
    this.destination = null;
    this.dryRun = false;
    this.rtmpUrl = options.rtmpUrl || process.env.RTMP_URL || '';
    this.rtmpKey = options.rtmpKey || process.env.RTMP_KEY || '';
    this.testInput = process.env.RTMP_TEST_INPUT || ''; // optional file path
  }

  get fullRtmpTarget() {
    if (!this.rtmpUrl) return null;
    const base = this.rtmpUrl.replace(/\/$/, '');
    const key = this.rtmpKey;
    if (!key) return base;
    // YouTube-style: url/key
    if (base.includes('youtube') || base.includes('facebook') || !base.endsWith(key)) {
      return `${base}/${key}`;
    }
    return base;
  }

  isRunning() {
    return !!(this.proc && !this.proc.killed);
  }

  status() {
    return {
      state: this.isRunning() ? 'live' : this.lastError ? 'error' : 'offline',
      dryRun: this.dryRun,
      destination: this.destination,
      bitrateKbps: this.isRunning() && !this.dryRun ? 2500 : null,
      fps: this.isRunning() ? 30 : null,
      startedAt: this.startedAt,
      lastError: this.lastError,
      targetConfigured: !!this.fullRtmpTarget,
    };
  }

  /**
   * @param {string} destination - youtube | facebook | rtmp
   * @param {{ rtmpUrl?: string, rtmpKey?: string }} [override]
   */
  async start(destination = 'rtmp', override = {}) {
    if (this.isRunning()) {
      return { ok: true, already: true, status: this.status() };
    }

    if (override.rtmpUrl) this.rtmpUrl = override.rtmpUrl;
    if (override.rtmpKey) this.rtmpKey = override.rtmpKey;

    this.destination = destination;
    this.lastError = null;
    const target = this.fullRtmpTarget;

    // No URL → dry-run (honest: encoder "live" only for control-plane testing if FORCE_DRY_RUN_LIVE=1)
    if (!target) {
      this.dryRun = true;
      this.startedAt = new Date().toISOString();
      // Simulate process with a timer handle
      this.proc = { killed: false, kill: () => { this.proc.killed = true; } };
      this.emit('start', this.status());
      console.log('[ffmpeg] DRY-RUN start (no RTMP_URL/RTMP_KEY). Set env to publish for real.');
      return {
        ok: true,
        dryRun: true,
        message: 'Dry-run: no RTMP_URL/RTMP_KEY. Process simulated.',
        status: this.status(),
      };
    }

    this.dryRun = false;
    const args = this._buildArgs(target);
    console.log('[ffmpeg] starting:', 'ffmpeg', args.join(' '));

    try {
      this.proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      this.lastError = String(e.message || e);
      this.proc = null;
      this.emit('error', this.lastError);
      return { ok: false, code: 'ENCODER_FAILED', message: this.lastError };
    }

    this.startedAt = new Date().toISOString();

    this.proc.stderr.on('data', (buf) => {
      const line = buf.toString();
      if (/error|failed|invalid/i.test(line)) {
        console.warn('[ffmpeg]', line.trim().slice(0, 200));
      }
    });

    this.proc.on('exit', (code, signal) => {
      console.log(`[ffmpeg] exit code=${code} signal=${signal}`);
      if (code && code !== 0) {
        this.lastError = `FFmpeg exited with code ${code}`;
        this.emit('error', this.lastError);
      }
      this.proc = null;
      this.emit('stop', this.status());
    });

    this.emit('start', this.status());
    return { ok: true, dryRun: false, status: this.status() };
  }

  async stop() {
    if (!this.proc) {
      return { ok: true, status: this.status() };
    }
    const p = this.proc;
    this.proc = null;
    try {
      if (typeof p.kill === 'function') p.kill('SIGTERM');
    } catch (_) {}
    // Force after 2s if real child
    if (p.pid) {
      setTimeout(() => {
        try {
          process.kill(p.pid, 'SIGKILL');
        } catch (_) {}
      }, 2000);
    }
    this.destination = null;
    this.dryRun = false;
    this.emit('stop', this.status());
    return { ok: true, status: this.status() };
  }

  _buildArgs(rtmpTarget) {
    // Test pattern until real Program frames from SFU
    // video: 1280x720 30fps, audio: sine
    const args = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-re',
    ];

    if (this.testInput) {
      args.push('-stream_loop', '-1', '-i', this.testInput);
    } else {
      args.push(
        '-f', 'lavfi',
        '-i', 'testsrc=size=1280x720:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=1000:sample_rate=48000'
      );
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', '2500k',
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-f', 'flv',
      rtmpTarget
    );

    return args;
  }
}

module.exports = { FFmpegWorker };
