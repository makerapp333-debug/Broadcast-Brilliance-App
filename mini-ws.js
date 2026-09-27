/**
 * Minimal WebSocket server (text frames only) — no npm deps.
 * Enough for Director Bridge control messages.
 */
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WebSocket extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = 1; // OPEN
    this._buf = Buffer.alloc(0);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => {
      this.readyState = 3;
      this.emit('close');
    });
    socket.on('error', (e) => this.emit('error', e));
  }

  send(data) {
    if (this.readyState !== 1) return;
    const payload = Buffer.from(String(data), 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // text, fin
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.readyState = 2;
    try {
      const r = Buffer.from(reason);
      const buf = Buffer.alloc(4 + r.length);
      buf[0] = 0x88;
      buf[1] = 2 + r.length;
      buf.writeUInt16BE(code, 2);
      r.copy(buf, 4);
      this.socket.write(buf);
    } catch (_) {}
    this.socket.end();
    this.readyState = 3;
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    while (this._buf.length >= 2) {
      const b0 = this._buf[0];
      const b1 = this._buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this._buf.length < 4) return;
        len = this._buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this._buf.length < 10) return;
        len = Number(this._buf.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      const total = offset + maskLen + len;
      if (this._buf.length < total) return;
      let payload = this._buf.subarray(offset + maskLen, total);
      if (masked) {
        const mask = this._buf.subarray(offset, offset + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      }
      this._buf = this._buf.subarray(total);
      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode === 0x9) {
        // ping → pong
        const pong = Buffer.alloc(2 + payload.length);
        pong[0] = 0x8a;
        pong[1] = payload.length;
        payload.copy(pong, 2);
        this.socket.write(pong);
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        this.emit('message', payload.toString('utf8'));
      }
    }
  }
}

function acceptWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  const pathOk = (req.url || '').startsWith('/bridge');
  if (!pathOk) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return null;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  if (head && head.length) socket.unshift(head);
  return new WebSocket(socket);
}

module.exports = { acceptWebSocket, WebSocket };
