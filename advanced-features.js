
// BROADCAST BRILLIANCE — Advanced modules v2.4.0
// Custom layouts · Audio DSP · Ad marketplace · Multi-op sync · Platform analytics

(function () {
  'use strict';

  // ---------- state seeds ----------
  state.customLayouts = state.customLayouts || loadJSON('bb_custom_layouts', []);
  state.layoutBuilder = state.layoutBuilder || { activeId: null, regions: [] };
  state.audioDsp = state.audioDsp || {
    enabled: false,
    eq: { low: 0, mid: 0, high: 0 },
    compressor: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
    limiter: { ceiling: -1 },
    noiseGate: { threshold: -50, enabled: false }
  };
  state.advertisers = state.advertisers || loadJSON('bb_advertisers', [
    { id: 'adv_saf', name: 'Safaricom', email: 'ads@safaricom.co.ke', balance: 50000, status: 'active' },
    { id: 'adv_eq', name: 'Equity Bank', email: 'marketing@equitybank.co.ke', balance: 32000, status: 'active' },
    { id: 'adv_kq', name: 'Kenya Airways', email: 'brand@kenya-airways.com', balance: 12000, status: 'pending' }
  ]);
  state.adSubmissions = state.adSubmissions || loadJSON('bb_ad_submissions', []);
  state.platformAnalytics = state.platformAnalytics || {
    youtube: { viewers: null, peak: null, likes: null, status: 'not_connected', lastFetch: null },
    facebook: { viewers: null, peak: null, status: 'not_connected', lastFetch: null },
    custom: { viewers: null, status: 'not_connected' },
    apiKeys: loadJSON('bb_platform_keys', { youtube: '', facebook: '' })
  };
  state.multiOp = state.multiOp || {
    role: 'director',
    roomId: 'bb-local-broadcast',
    peers: [],
    channel: null,
    ws: null
  };
  state._dspNodes = state._dspNodes || null;

  function loadJSON(key, fallback) {
    try {
      const r = localStorage.getItem(key);
      return r ? JSON.parse(r) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // ========== 1. CUSTOM LAYOUT BUILDER ==========
  function openLayoutBuilder() {
    navigateTo('layouts');
    renderLayoutBuilder();
  }

  function renderLayoutBuilder() {
    const list = document.getElementById('lb-list');
    const canvas = document.getElementById('lb-canvas');
    if (!list) return;
    list.innerHTML = (state.customLayouts || []).map(function (L) {
      const active = state.layout === L.id ? 'border-green-500' : 'border-[#1e2a3a]';
      return '<div class="p-2 rounded border ' + active + ' bg-[#131a28] flex items-center justify-between gap-2">' +
        '<div><div class="text-white text-[11px] font-semibold">' + L.name + '</div>' +
        '<div class="text-[9px] text-slate-500">' + (L.regions || []).length + ' regions</div></div>' +
        '<div class="flex gap-1">' +
        '<button type="button" onclick="applyCustomLayout(\'' + L.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-800 text-white">Apply</button>' +
        '<button type="button" onclick="editCustomLayout(\'' + L.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-900 text-blue-100">Edit</button>' +
        '<button type="button" onclick="deleteCustomLayout(\'' + L.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-red-950 text-red-200">Del</button>' +
        '</div></div>';
    }).join('') || '<div class="text-slate-500 text-[10px]">No custom layouts yet</div>';

    const regs = state.layoutBuilder.regions || [];
    if (canvas) {
      canvas.innerHTML = regs.map(function (r, i) {
        return '<div class="lb-region absolute border-2 border-cyan-400 bg-cyan-900/30 text-[9px] text-white p-0.5 cursor-move" data-i="' + i + '" style="left:' + (r.x * 100) + '%;top:' + (r.y * 100) + '%;width:' + (r.w * 100) + '%;height:' + (r.h * 100) + '%">' +
          '<div class="flex items-center justify-between gap-0.5 mb-0.5">' +
          '<span class="text-[8px] text-cyan-200">R' + (i + 1) + '</span>' +
          '<button type="button" class="lb-del text-[8px] text-red-300 px-0.5" data-i="' + i + '">×</button></div>' +
          '<select class="lb-src w-full bg-black/70 text-[9px] text-white" data-i="' + i + '">' +
          (state.sources || []).map(function (s) {
            return '<option value="' + s.id + '"' + (s.id === r.sourceId ? ' selected' : '') + '>' + s.name + '</option>';
          }).join('') +
          '</select>' +
          '<div class="lb-resize absolute right-0 bottom-0 w-3 h-3 bg-cyan-400 cursor-se-resize" data-i="' + i + '" title="Resize"></div>' +
          '</div>';
      }).join('');
      canvas.querySelectorAll('.lb-src').forEach(function (sel) {
        sel.onchange = function () {
          const i = +sel.getAttribute('data-i');
          if (state.layoutBuilder.regions[i]) state.layoutBuilder.regions[i].sourceId = sel.value;
        };
      });
      canvas.querySelectorAll('.lb-del').forEach(function (btn) {
        btn.onclick = function (ev) {
          ev.stopPropagation();
          const i = +btn.getAttribute('data-i');
          state.layoutBuilder.regions.splice(i, 1);
          renderLayoutBuilder();
        };
      });
      // drag regions
      canvas.querySelectorAll('.lb-region').forEach(function (el) {
        el.onmousedown = function (ev) {
          if (ev.target.tagName === 'SELECT' || ev.target.classList.contains('lb-resize') || ev.target.classList.contains('lb-del')) return;
          const i = +el.getAttribute('data-i');
          const startX = ev.clientX, startY = ev.clientY;
          const rect = canvas.getBoundingClientRect();
          const reg = state.layoutBuilder.regions[i];
          const ox = reg.x, oy = reg.y;
          function move(e) {
            reg.x = Math.max(0, Math.min(1 - reg.w, ox + (e.clientX - startX) / rect.width));
            reg.y = Math.max(0, Math.min(1 - reg.h, oy + (e.clientY - startY) / rect.height));
            el.style.left = (reg.x * 100) + '%';
            el.style.top = (reg.y * 100) + '%';
          }
          function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
          }
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
        };
      });
      // resize handles
      canvas.querySelectorAll('.lb-resize').forEach(function (handle) {
        handle.onmousedown = function (ev) {
          ev.stopPropagation();
          const i = +handle.getAttribute('data-i');
          const startX = ev.clientX, startY = ev.clientY;
          const rect = canvas.getBoundingClientRect();
          const reg = state.layoutBuilder.regions[i];
          const ow = reg.w, oh = reg.h;
          const el = handle.parentElement;
          function move(e) {
            reg.w = Math.max(0.08, Math.min(1 - reg.x, ow + (e.clientX - startX) / rect.width));
            reg.h = Math.max(0.08, Math.min(1 - reg.y, oh + (e.clientY - startY) / rect.height));
            el.style.width = (reg.w * 100) + '%';
            el.style.height = (reg.h * 100) + '%';
          }
          function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
          }
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
        };
      });
    }
  }

  function lbAddRegion() {
    state.layoutBuilder.regions = state.layoutBuilder.regions || [];
    const n = state.layoutBuilder.regions.length;
    state.layoutBuilder.regions.push({
      x: 0.05 + (n % 2) * 0.48,
      y: 0.05 + Math.floor(n / 2) * 0.45,
      w: 0.42,
      h: 0.4,
      sourceId: (state.sources[0] && state.sources[0].id) || 'cam1'
    });
    renderLayoutBuilder();
  }

  function lbNewLayout() {
    state.layoutBuilder = {
      activeId: null,
      name: 'Custom ' + (state.customLayouts.length + 1),
      regions: [
        { x: 0, y: 0, w: 0.65, h: 1, sourceId: 'cam1' },
        { x: 0.65, y: 0, w: 0.35, h: 0.5, sourceId: 'guest1' },
        { x: 0.65, y: 0.5, w: 0.35, h: 0.5, sourceId: 'yt1' }
      ]
    };
    const nameEl = document.getElementById('lb-name');
    if (nameEl) nameEl.value = state.layoutBuilder.name;
    renderLayoutBuilder();
  }

  function lbSaveLayout() {
    const nameEl = document.getElementById('lb-name');
    const name = (nameEl && nameEl.value.trim()) || 'Custom Layout';
    const regions = (state.layoutBuilder.regions || []).map(function (r) {
      return { x: r.x, y: r.y, w: r.w, h: r.h, sourceId: r.sourceId };
    });
    if (!regions.length) {
      if (typeof pushNotification === 'function') pushNotification('Layouts', 'Add at least one region', 'warn');
      return;
    }
    let id = state.layoutBuilder.activeId;
    if (id) {
      const existing = state.customLayouts.find(function (L) { return L.id === id; });
      if (existing) { existing.name = name; existing.regions = regions; }
    } else {
      id = 'custom_' + Date.now().toString(36);
      state.customLayouts.push({ id: id, name: name, regions: regions });
    }
    state.layoutBuilder.activeId = id;
    // Register in LAYOUTS for setLayout compatibility
    LAYOUTS[id] = { name: name, slots: regions.length, labels: regions.map(function (_, i) { return 'R' + (i + 1); }), custom: true, regions: regions };
    saveJSON('bb_custom_layouts', state.customLayouts);
    renderLayoutBuilder();
    refreshLayoutButtons();
    if (typeof audit === 'function') audit('LAYOUT_SAVE', name);
    if (typeof pushNotification === 'function') pushNotification('Layouts', 'Saved: ' + name, 'ok');
  }

  function applyCustomLayout(id) {
    const L = state.customLayouts.find(function (x) { return x.id === id; });
    if (!L) return;
    LAYOUTS[id] = { name: L.name, slots: L.regions.length, labels: L.regions.map(function (_, i) { return 'R' + (i + 1); }), custom: true, regions: L.regions };
    state.layout = id;
    state.programSlots = L.regions.map(function (r) { return r.sourceId; });
    state.previewSlots = L.regions.map(function (r) { return r.sourceId; });
    if (typeof renderPreview === 'function') renderPreview();
    if (typeof renderProgram === 'function') renderProgram();
    refreshLayoutButtons();
    if (typeof multiOpBroadcast === 'function') multiOpBroadcast('layout', { layout: id, slots: state.programSlots });
    if (typeof audit === 'function') audit('LAYOUT_APPLY', L.name);
  }

  function editCustomLayout(id) {
    const L = state.customLayouts.find(function (x) { return x.id === id; });
    if (!L) return;
    state.layoutBuilder = { activeId: id, name: L.name, regions: L.regions.map(function (r) { return Object.assign({}, r); }) };
    const nameEl = document.getElementById('lb-name');
    if (nameEl) nameEl.value = L.name;
    renderLayoutBuilder();
  }

  function deleteCustomLayout(id) {
    state.customLayouts = state.customLayouts.filter(function (L) { return L.id !== id; });
    saveJSON('bb_custom_layouts', state.customLayouts);
    if (state.layout === id) setLayout('fullscreen');
    renderLayoutBuilder();
    refreshLayoutButtons();
  }

  function refreshLayoutButtons() {
    const bar = document.getElementById('layout-btn-bar');
    if (!bar) return;
    // ensure custom buttons
    bar.querySelectorAll('[data-custom-layout]').forEach(function (b) { b.remove(); });
    (state.customLayouts || []).forEach(function (L) {
      const b = document.createElement('button');
      b.setAttribute('data-custom-layout', L.id);
      b.className = 'layout-btn px-1.5 py-0.5 rounded border border-[#2a3a4f] bg-[#131a28] text-[10px] text-slate-400';
      if (state.layout === L.id) b.classList.add('layout-active');
      b.textContent = L.name.slice(0, 10);
      b.onclick = function () { applyCustomLayout(L.id); };
      bar.appendChild(b);
    });
  }

  // Register saved customs into LAYOUTS on load
  (state.customLayouts || []).forEach(function (L) {
    LAYOUTS[L.id] = { name: L.name, slots: (L.regions || []).length, labels: (L.regions || []).map(function (_, i) { return 'R' + (i + 1); }), custom: true, regions: L.regions };
  });

  // ========== 2. AUDIO DSP (Web Audio) ==========
  function ensureDspGraph() {
    if (state._dspNodes) return state._dspNodes;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const input = ctx.createGain();
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3200;
    const comp = ctx.createDynamicsCompressor();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.05;
    const output = ctx.createGain();
    input.connect(low); low.connect(mid); mid.connect(high); high.connect(comp); comp.connect(limiter); limiter.connect(output);
    // output not connected to destination by default (avoid feedback with video elements)
    state._dspNodes = { ctx: ctx, input: input, low: low, mid: mid, high: high, comp: comp, limiter: limiter, output: output, sources: {} };
    applyDspSettings();
    return state._dspNodes;
  }

  function applyDspSettings() {
    const n = state._dspNodes;
    const d = state.audioDsp;
    if (!n || !d) return;
    n.low.gain.value = d.eq.low;
    n.mid.gain.value = d.eq.mid;
    n.high.gain.value = d.eq.high;
    n.comp.threshold.value = d.compressor.threshold;
    n.comp.ratio.value = d.compressor.ratio;
    n.comp.attack.value = d.compressor.attack;
    n.comp.release.value = d.compressor.release;
    n.limiter.threshold.value = d.limiter.ceiling;
  }

  function connectStreamToDsp(stream, id) {
    if (!state.audioDsp.enabled || !stream) return stream;
    const n = ensureDspGraph();
    if (!n) return stream;
    try {
      if (n.sources[id]) {
        try { n.sources[id].disconnect(); } catch (e) {}
      }
      const src = n.ctx.createMediaStreamSource(stream);
      const dest = n.ctx.createMediaStreamDestination();
      src.connect(n.input);
      n.output.connect(dest);
      n.sources[id] = src;
      // merge processed audio with original video tracks
      const out = new MediaStream();
      stream.getVideoTracks().forEach(function (t) { out.addTrack(t); });
      dest.stream.getAudioTracks().forEach(function (t) { out.addTrack(t); });
      return out;
    } catch (e) {
      console.warn('DSP connect failed', e);
      return stream;
    }
  }

  function toggleAudioDsp(on) {
    state.audioDsp.enabled = !!on;
    applyDspSettings();
    // Re-route local camera audio through DSP when available
    try {
      if (on && state.media && state.media.rawCameraStream) {
        const processed = connectStreamToDsp(state.media.rawCameraStream, 'cam1');
        if (processed && processed !== state.media.rawCameraStream) {
          state.media.localStream = processed;
          state.media.dspActive = true;
        }
      } else if (!on && state.media && state.media.rawCameraStream) {
        state.media.localStream = state.media.rawCameraStream;
        state.media.dspActive = false;
      } else if (on && state.media && state.media.localStream) {
        state.media.rawCameraStream = state.media.rawCameraStream || state.media.localStream;
        const processed = connectStreamToDsp(state.media.rawCameraStream, 'cam1');
        if (processed) {
          state.media.localStream = processed;
          state.media.dspActive = true;
        }
      }
      if (typeof applyLocalAudioGain === 'function') applyLocalAudioGain();
      if (typeof pushNotification === 'function') {
        pushNotification('DSP', on ? 'Audio DSP enabled on local stream' : 'Audio DSP disabled', on ? 'ok' : 'info');
      }
    } catch (e) {
      console.warn('DSP toggle', e);
    }
    if (typeof audit === 'function') audit('DSP', on ? 'enabled' : 'disabled');
    renderAudioDspPanel();
  }

  function setDspEq(band, val) {
    state.audioDsp.eq[band] = Number(val) || 0;
    applyDspSettings();
  }

  function setDspComp(key, val) {
    state.audioDsp.compressor[key] = Number(val);
    applyDspSettings();
  }

  function renderAudioDspPanel() {
    const on = document.getElementById('dsp-enabled');
    if (on) on.checked = !!state.audioDsp.enabled;
    const d = state.audioDsp;
    const set = function (id, v) { const el = document.getElementById(id); if (el) el.value = v; };
    set('dsp-eq-low', d.eq.low);
    set('dsp-eq-mid', d.eq.mid);
    set('dsp-eq-high', d.eq.high);
    set('dsp-comp-thresh', d.compressor.threshold);
    set('dsp-comp-ratio', d.compressor.ratio);
  }

  // ========== 3. ADVERTISER MARKETPLACE ==========
  function renderMarketplace() {
    const advBox = document.getElementById('mp-advertisers');
    const subBox = document.getElementById('mp-submissions');
    if (advBox) {
      advBox.innerHTML = (state.advertisers || []).map(function (a) {
        return '<div class="flex items-center justify-between px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a] text-[10px]">' +
          '<div><div class="text-white font-semibold">' + a.name + '</div>' +
          '<div class="text-slate-500">' + a.email + ' · KES ' + (a.balance || 0).toLocaleString() + '</div></div>' +
          '<span class="' + (a.status === 'active' ? 'text-green-400' : 'text-amber-400') + '">' + a.status + '</span></div>';
      }).join('') || '<div class="text-slate-500 text-[10px]">No advertisers</div>';
    }
    if (subBox) {
      subBox.innerHTML = (state.adSubmissions || []).map(function (s) {
        return '<div class="p-2 rounded border border-[#1e2a3a] bg-[#131a28] text-[10px] mb-1">' +
          '<div class="flex justify-between"><span class="text-white font-semibold">' + s.title + '</span><span class="text-slate-500">' + s.status + '</span></div>' +
          '<div class="text-slate-400">' + s.advertiser + ' · ' + s.dur + ' · bid KES ' + s.bid + '</div>' +
          (s.status === 'pending' ? '<div class="flex gap-1 mt-1">' +
            '<button type="button" onclick="mpApprove(\'' + s.id + '\')" class="px-1.5 py-0.5 rounded bg-green-800 text-white text-[9px]">Approve</button>' +
            '<button type="button" onclick="mpReject(\'' + s.id + '\')" class="px-1.5 py-0.5 rounded bg-red-900 text-red-100 text-[9px]">Reject</button></div>' : '') +
          '</div>';
      }).join('') || '<div class="text-slate-500 text-[10px]">No submissions</div>';
    }
    const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('mp-stat-adv', (state.advertisers || []).length);
    set('mp-stat-pending', (state.adSubmissions || []).filter(function (s) { return s.status === 'pending'; }).length);
    set('mp-stat-approved', (state.ads || []).filter(function (a) { return a.status === 'approved'; }).length);
  }

  function mpAddAdvertiser() {
    const name = (document.getElementById('mp-adv-name') || {}).value || '';
    const email = (document.getElementById('mp-adv-email') || {}).value || '';
    if (!name.trim()) return;
    state.advertisers.unshift({
      id: 'adv_' + Date.now().toString(36),
      name: name.trim(),
      email: email.trim(),
      balance: 0,
      status: 'pending'
    });
    saveJSON('bb_advertisers', state.advertisers);
    renderMarketplace();
    if (typeof audit === 'function') audit('MP_ADV_ADD', name);
  }

  function mpSubmitAd() {
    const title = (document.getElementById('mp-ad-title') || {}).value || 'Untitled ad';
    const adv = (document.getElementById('mp-ad-advertiser') || {}).value || 'Unknown';
    const dur = (document.getElementById('mp-ad-dur') || {}).value || '00:30';
    const bid = Number((document.getElementById('mp-ad-bid') || {}).value || 0);
    const sub = {
      id: 'sub_' + Date.now().toString(36),
      title: title,
      advertiser: adv,
      dur: dur,
      durSec: typeof parseDur === 'function' ? parseDur(dur) : 30,
      bid: bid,
      status: 'pending',
      createdAt: Date.now()
    };
    state.adSubmissions.unshift(sub);
    saveJSON('bb_ad_submissions', state.adSubmissions);
    renderMarketplace();
    if (typeof pushNotification === 'function') pushNotification('Marketplace', 'Ad submitted for review', 'info');
    if (typeof audit === 'function') audit('MP_SUBMIT', title);
  }

  function mpApprove(id) {
    const s = state.adSubmissions.find(function (x) { return x.id === id; });
    if (!s) return;
    s.status = 'approved';
    // push into Program ads inventory
    state.ads.unshift({
      id: 'ad_' + Date.now().toString(36),
      title: s.title,
      advertiser: s.advertiser,
      campaign: 'Marketplace',
      dur: s.dur,
      durSec: s.durSec,
      status: 'approved',
      priority: 2,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      dayStart: '00:00',
      dayEnd: '23:59',
      maxPerDay: 20,
      maxTotal: 200,
      minGapMin: 5,
      plays: 0,
      playsToday: 0,
      lastPlayedAt: null,
      bid: s.bid
    });
    saveJSON('bb_ad_submissions', state.adSubmissions);
    renderMarketplace();
    if (typeof renderAdsPage === 'function') renderAdsPage();
    if (typeof pushNotification === 'function') pushNotification('Marketplace', 'Approved: ' + s.title, 'ok');
    if (typeof audit === 'function') audit('MP_APPROVE', s.title);
  }

  function mpReject(id) {
    const s = state.adSubmissions.find(function (x) { return x.id === id; });
    if (!s) return;
    s.status = 'rejected';
    saveJSON('bb_ad_submissions', state.adSubmissions);
    renderMarketplace();
    if (typeof audit === 'function') audit('MP_REJECT', s.title);
  }

  // ========== 4. MULTI-OPERATOR REALTIME ==========
  function multiOpInit() {
    try {
      if (state.multiOp.channel) return;
      const ch = new BroadcastChannel('bb_production_' + (state.multiOp.roomId || 'default'));
      state.multiOp.channel = ch;
      ch.onmessage = function (ev) {
        const msg = ev.data;
        if (!msg || msg.senderId === state.multiOp.peerId) return;
        applyMultiOpMessage(msg);
      };
      state.multiOp.peerId = 'op_' + Math.random().toString(36).slice(2, 8);
      multiOpBroadcast('presence', { name: (state.users && state.users[0] && state.users[0].name) || 'Operator', role: state.multiOp.role });
      renderMultiOpPeers();
    } catch (e) {
      console.warn('BroadcastChannel unavailable', e);
    }
    // Also try Bridge WS for cross-device
    multiOpConnectBridge();
  }

  function multiOpConnectBridge() {
    const url = (state.settings && state.settings.bridgeUrl) || window.BRIDGE_WS_URL || '';
    if (!url || !url.startsWith('ws')) return;
    try {
      const wsUrl = url.replace(/\/bridge.*/, '/bridge') + (url.indexOf('?') >= 0 ? '&' : '?') + 'broadcastId=' + encodeURIComponent(state.multiOp.roomId || 'bb-local-broadcast') + '&role=operator';
      // Use existing bridge client when available for production.sync
      if (typeof bridge !== 'undefined' && bridge && bridge.connected) {
        // publish via bridge
      }
    } catch (e) {}
  }

  function multiOpBroadcast(type, payload) {
    const msg = {
      type: type,
      payload: payload,
      senderId: state.multiOp.peerId,
      ts: Date.now()
    };
    try {
      if (state.multiOp.channel) state.multiOp.channel.postMessage(msg);
    } catch (e) {}
    // Bridge production sync
    if (typeof bridge !== 'undefined' && bridge && bridge.connected && typeof bridge.send === 'function') {
      try { bridge.send('production.sync', { type: type, payload: payload, senderId: state.multiOp.peerId }); } catch (e) {}
    }
  }

  function applyMultiOpMessage(msg) {
    if (!msg) return;
    if (msg.type === 'presence') {
      state.multiOp.peers = state.multiOp.peers || [];
      const existing = state.multiOp.peers.find(function (p) { return p.id === msg.senderId; });
      if (existing) {
        existing.name = msg.payload.name;
        existing.role = msg.payload.role;
        existing.last = Date.now();
      } else {
        state.multiOp.peers.push({ id: msg.senderId, name: msg.payload.name, role: msg.payload.role, last: Date.now() });
      }
      renderMultiOpPeers();
    } else if (msg.type === 'layout') {
      if (msg.payload.layout && msg.payload.layout !== state.layout) {
        if (LAYOUTS[msg.payload.layout] && LAYOUTS[msg.payload.layout].custom) {
          applyCustomLayout(msg.payload.layout);
        } else if (typeof setLayout === 'function') {
          setLayout(msg.payload.layout);
        }
      }
    } else if (msg.type === 'take') {
      if (msg.payload.programSlots) {
        state.programSlots = msg.payload.programSlots.slice();
        if (typeof renderProgram === 'function') renderProgram();
      }
    } else if (msg.type === 'graphics') {
      if (msg.payload.graphics) {
        state._multiOpApplying = true;
        state.graphics = Object.assign(state.graphics || {}, msg.payload.graphics);
        if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram();
        state._multiOpApplying = false;
      }
    } else if (msg.type === 'emergency') {
      if (msg.payload && msg.payload.on) {
        if (typeof activateEmergency === 'function') activateEmergency(msg.payload.mode || 'full');
      } else if (typeof clearEmergency === 'function') {
        clearEmergency();
      }
    } else if (msg.type === 'rundown') {
      if (Array.isArray(msg.payload.rundown)) {
        state.rundown = msg.payload.rundown;
        if (typeof renderRundownTable === 'function') renderRundownTable();
      }
    }
    const log = document.getElementById('multiop-log');
    if (log) {
      log.textContent = new Date().toLocaleTimeString() + ' ' + msg.type + ' from ' + (msg.senderId || '') + '\n' + log.textContent.slice(0, 400);
    }
  }

  function renderMultiOpPeers() {
    const box = document.getElementById('multiop-peers');
    if (!box) return;
    const peers = state.multiOp.peers || [];
    box.innerHTML = peers.map(function (p) {
      return '<div class="text-[10px] text-slate-300">' + p.name + ' · ' + p.role + '</div>';
    }).join('') || '<div class="text-[10px] text-slate-500">Only you in this room (open another tab to test)</div>';
  }

  // Hook TAKE to broadcast
  const _origCompleteTake = typeof completeTake === 'function' ? completeTake : null;
  // patched later via wrap

  // ========== 5. PLATFORM ANALYTICS ==========
  async function fetchYouTubeViewers() {
    const key = (state.platformAnalytics.apiKeys && state.platformAnalytics.apiKeys.youtube) || '';
    const videoId = (document.getElementById('an-yt-video') || {}).value || '';
    const pa = state.platformAnalytics.youtube;
    if (!key || !videoId) {
      pa.status = 'need_api_key_and_video_id';
      renderPlatformAnalytics();
      if (typeof pushNotification === 'function') {
        pushNotification('Analytics', 'Enter YouTube API key + live video ID. Real counts require Google API credentials.', 'warn');
      }
      return;
    }
    pa.status = 'fetching';
    renderPlatformAnalytics();
    try {
      // YouTube Data API v3 videos.list — concurrentViewers only for liveBroadcastContent
      const url = 'https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,statistics&id=' +
        encodeURIComponent(videoId) + '&key=' + encodeURIComponent(key);
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || res.statusText);
      const item = data.items && data.items[0];
      if (!item) throw new Error('Video not found');
      const live = item.liveStreamingDetails || {};
      const stats = item.statistics || {};
      pa.viewers = live.concurrentViewers != null ? Number(live.concurrentViewers) : null;
      pa.peak = pa.peak != null ? Math.max(pa.peak, pa.viewers || 0) : pa.viewers;
      pa.likes = stats.likeCount != null ? Number(stats.likeCount) : null;
      pa.status = pa.viewers != null ? 'live' : 'no_concurrent_data';
      pa.lastFetch = Date.now();
      // Feed session viewer count when available
      if (pa.viewers != null) {
        state.viewerCount = pa.viewers;
        if (pa.viewers > (state.peakViewers || 0)) state.peakViewers = pa.viewers;
      }
    } catch (e) {
      pa.status = 'error: ' + (e.message || e);
      if (typeof pushNotification === 'function') pushNotification('Analytics', String(e.message || e), 'error');
    }
    renderPlatformAnalytics();
    if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage();
  }

  function savePlatformKeys() {
    state.platformAnalytics.apiKeys = {
      youtube: ((document.getElementById('an-yt-key') || {}).value || '').trim(),
      facebook: ((document.getElementById('an-fb-key') || {}).value || '').trim()
    };
    saveJSON('bb_platform_keys', state.platformAnalytics.apiKeys);
    if (typeof pushNotification === 'function') pushNotification('Analytics', 'API keys saved locally (never sent to our server)', 'ok');
  }

  function renderPlatformAnalytics() {
    const y = state.platformAnalytics.youtube;
    const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('an-plat-yt-viewers', y.viewers != null ? y.viewers : '—');
    set('an-plat-yt-peak', y.peak != null ? y.peak : '—');
    set('an-plat-yt-status', y.status || 'not_connected');
    set('an-plat-yt-likes', y.likes != null ? y.likes : '—');
    const fb = state.platformAnalytics.facebook;
    set('an-plat-fb-status', fb.status || 'not_connected');
    set('an-plat-fb-viewers', fb.viewers != null ? fb.viewers : '—');
  }

  // ========== NAV helpers ==========
  function renderAdvancedView(id) {
    if (id === 'layouts') renderLayoutBuilder();
    if (id === 'marketplace') renderMarketplace();
    if (id === 'audio') renderAudioDspPanel();
    if (id === 'analytics') renderPlatformAnalytics();
    if (id === 'users' || id === 'home') renderMultiOpPeers();
  }

  // Export
  function exportCustomLayouts() {
    const data = JSON.stringify({ version: 1, layouts: state.customLayouts || [] }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bb-custom-layouts.json';
    a.click();
    if (typeof audit === 'function') audit('LAYOUT_EXPORT', (state.customLayouts || []).length + ' layouts');
    if (typeof pushNotification === 'function') pushNotification('Layouts', 'Exported JSON', 'ok');
  }
  function importCustomLayouts(input) {
    const f = input && input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        const list = (data && data.layouts) ? data.layouts : (Array.isArray(data) ? data : []);
        list.forEach(function (L) {
          if (!L || !L.id || !L.regions) return;
          const existing = state.customLayouts.findIndex(function (x) { return x.id === L.id; });
          if (existing >= 0) state.customLayouts[existing] = L;
          else state.customLayouts.push(L);
          LAYOUTS[L.id] = { name: L.name, slots: L.regions.length, labels: L.regions.map(function (_, i) { return 'R' + (i + 1); }), custom: true, regions: L.regions };
        });
        saveJSON('bb_custom_layouts', state.customLayouts);
        renderLayoutBuilder();
        refreshLayoutButtons();
        if (typeof pushNotification === 'function') pushNotification('Layouts', 'Imported ' + list.length + ' layout(s)', 'ok');
      } catch (e) {
        if (typeof pushNotification === 'function') pushNotification('Layouts', 'Import failed: ' + e.message, 'error');
      }
      input.value = '';
    };
    reader.readAsText(f);
  }
  window.exportCustomLayouts = exportCustomLayouts;
  window.importCustomLayouts = importCustomLayouts;
  window.openLayoutBuilder = openLayoutBuilder;
  window.renderLayoutBuilder = renderLayoutBuilder;
  window.lbAddRegion = lbAddRegion;
  window.lbNewLayout = lbNewLayout;
  window.lbSaveLayout = lbSaveLayout;
  window.applyCustomLayout = applyCustomLayout;
  window.editCustomLayout = editCustomLayout;
  window.deleteCustomLayout = deleteCustomLayout;
  window.refreshLayoutButtons = refreshLayoutButtons;
  window.toggleAudioDsp = toggleAudioDsp;
  window.setDspEq = setDspEq;
  window.setDspComp = setDspComp;
  window.connectStreamToDsp = connectStreamToDsp;
  window.renderAudioDspPanel = renderAudioDspPanel;
  window.renderMarketplace = renderMarketplace;
  window.mpAddAdvertiser = mpAddAdvertiser;
  window.mpSubmitAd = mpSubmitAd;
  window.mpApprove = mpApprove;
  window.mpReject = mpReject;
  window.multiOpInit = multiOpInit;
  window.multiOpBroadcast = multiOpBroadcast;
  async function fetchFacebookViewers() {
    const token = (state.platformAnalytics.apiKeys && state.platformAnalytics.apiKeys.facebook) || '';
    const videoId = (document.getElementById('an-fb-video') || {}).value || '';
    const pa = state.platformAnalytics.facebook;
    if (!token || !videoId) {
      pa.status = 'need_token_and_video_id';
      renderPlatformAnalytics();
      if (typeof pushNotification === 'function') {
        pushNotification('Analytics', 'Enter Facebook Page token + live video ID', 'warn');
      }
      return;
    }
    pa.status = 'fetching';
    renderPlatformAnalytics();
    try {
      const url = 'https://graph.facebook.com/v19.0/' + encodeURIComponent(videoId) +
        '?fields=live_views,permalink_url&access_token=' + encodeURIComponent(token);
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || res.statusText);
      pa.viewers = data.live_views != null ? Number(data.live_views) : null;
      pa.peak = pa.peak != null ? Math.max(pa.peak, pa.viewers || 0) : pa.viewers;
      pa.status = pa.viewers != null ? 'live' : 'no_live_views_field';
      pa.lastFetch = Date.now();
      if (pa.viewers != null) {
        state.viewerCount = (state.viewerCount || 0) + 0; // keep YT primary if set
        if (state.platformAnalytics.youtube.viewers == null) state.viewerCount = pa.viewers;
      }
    } catch (e) {
      pa.status = 'error: ' + (e.message || e);
      if (typeof pushNotification === 'function') pushNotification('Analytics', String(e.message || e), 'error');
    }
    renderPlatformAnalytics();
  }
  window.fetchYouTubeViewers = fetchYouTubeViewers;
  window.fetchFacebookViewers = fetchFacebookViewers;
  window.savePlatformKeys = savePlatformKeys;
  window.renderPlatformAnalytics = renderPlatformAnalytics;
  window.renderAdvancedView = renderAdvancedView;

  // Boot
  setTimeout(function () {
    try { multiOpInit(); } catch (e) {}
    try { refreshLayoutButtons(); } catch (e) {}
  }, 400);
})();
