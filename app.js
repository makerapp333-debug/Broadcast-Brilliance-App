// BROADCAST BRILLIANCE v1.45.0 — Keyboard help + ON AIR sync
// getUserMedia → canvas compositor → MediaRecorder
// Optional screen share · Encoder / RTMP remain NOT CONNECTED

const LAYOUTS = {
  fullscreen: { name: 'Full Screen', slots: 1, labels: ['Main'] },
  '2way': { name: '2-Way Split', slots: 2, labels: ['Left', 'Right'] },
  '2x2': { name: '2×2 Multiview', slots: 4, labels: ['TL', 'TR', 'BL', 'BR'] },
  'host-guest': { name: 'Host + Guest', slots: 2, labels: ['Host', 'Guest'] },
  pip: { name: 'Picture-in-Picture', slots: 2, labels: ['Main', 'PiP'] },
};
const SOURCE_MAP = {
  'Camera 1': 'cam1', 'Camera 2': 'cam2', 'Camera 3': 'cam3',
  'Guest 1': 'guest1', 'Guest 2': 'guest2',
  'YouTube': 'yt1', 'Video': 'media1', 'Ads': 'ad_spot'
};

function parseDur(str) {
  const p = (str || '0:00').split(':').map(Number);
  if (p.length === 2) return p[0] * 60 + p[1];
  return 60;
}
function formatDur(sec) {
  sec = Math.max(0, Math.floor(sec));
  return String(Math.floor(sec / 60)).padStart(2,'0') + ':' + String(sec % 60).padStart(2,'0');
}
function formatTimer(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h,m,sec].map(n => String(n).padStart(2,'0')).join(':');
}

function updateBroadcastUI() {
  const st = state.broadcastState || 'offline';
  const badge = document.getElementById('broadcast-badge');
  const label = document.getElementById('broadcast-label');
  const dot = document.getElementById('broadcast-dot');
  const btnStart = document.getElementById('btn-broadcast-start');
  const btnStop = document.getElementById('btn-broadcast-stop');
  const styles = {
    offline:  { bg: 'bg-slate-700', text: 'text-slate-200', dot: 'bg-slate-400', label: 'OFFLINE' },
    starting: { bg: 'bg-amber-700', text: 'text-amber-100', dot: 'bg-amber-300', label: 'STARTING' },
    live:     { bg: 'bg-red-600', text: 'text-white', dot: 'bg-white live-dot', label: 'LIVE' },
    stopping: { bg: 'bg-orange-800', text: 'text-orange-100', dot: 'bg-orange-300', label: 'STOPPING' },
    ended:    { bg: 'bg-slate-800', text: 'text-slate-400', dot: 'bg-slate-500', label: 'ENDED' }
  };
  const s = styles[st] || styles.offline;
  if (badge) badge.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded ' + s.bg + ' ' + s.text + ' text-[11px] font-bold';
  if (label) label.textContent = s.label;
  if (dot) dot.className = 'w-1.5 h-1.5 rounded-full ' + s.dot;
  if (btnStart) btnStart.classList.toggle('hidden', st === 'live' || st === 'starting');
  if (btnStop) btnStop.classList.toggle('hidden', st !== 'live' && st !== 'starting');
  // LIVE graphic follows broadcast when operator hasn't forced it off mid-show preference: auto-enable on start only
  if (typeof renderHomeDashboard === 'function' && state.currentView === 'home') renderHomeDashboard();
  // Program monitor ON AIR / STANDBY
  const pgm = document.getElementById('pgm-onair-badge');
  const pgmDot = document.getElementById('pgm-onair-dot');
  const pgmLab = document.getElementById('pgm-onair-label');
  const live = st === 'live';
  if (pgm) pgm.className = 'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ' + (live ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300');
  if (pgmDot) pgmDot.className = 'w-1.5 h-1.5 rounded-full ' + (live ? 'bg-white live-dot' : 'bg-slate-400');
  if (pgmLab) pgmLab.textContent = live ? 'ON AIR' : (st === 'starting' ? 'STARTING' : 'STANDBY');
}

function toggleKeyboardHelp(force) {
  const m = document.getElementById('kb-help-modal');
  if (!m) return;
  const open = force === false ? false : force === true ? true : m.classList.contains('hidden');
  m.classList.toggle('hidden', !open);
}


function startBroadcast() {
  if (state.broadcastState === 'live' || state.broadcastState === 'starting') return;
  state.broadcastState = 'starting';
  updateBroadcastUI();
  audit('BROADCAST_START', 'Starting session');
  if (typeof pushNotification === 'function') pushNotification('BROADCAST', 'Starting… (encoder may still be offline)', 'info');
  setTimeout(() => {
    state.broadcastState = 'live';
    state.timerSeconds = 0;
    // Enable LIVE bug by default when going live
    if (state.graphics && state.graphics.live) {
      state.graphics.live.enabled = true;
      if (typeof updateToggleUI === 'function') updateToggleUI('live');
      if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram();
    }
    if (!state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
    updateBroadcastUI();
    const t = document.getElementById('timer');
    if (t) t.textContent = formatTimer(0);
    audit('BROADCAST_LIVE', 'Session live — Program on air (local)');
    if (typeof pushNotification === 'function') {
      pushNotification('BROADCAST', 'LIVE — local Program active. Encoder/RTMP: not connected unless Bridge says otherwise.', 'ok');
    }
    if (typeof notifyBridgeState === 'function') notifyBridgeState();
  }, 600);
}

function stopBroadcast() {
  if (state.broadcastState !== 'live' && state.broadcastState !== 'starting') return;
  state.broadcastState = 'stopping';
  updateBroadcastUI();
  audit('BROADCAST_STOPPING', 'Stopping session');
  setTimeout(() => {
    state.broadcastState = 'ended';
    updateBroadcastUI();
    audit('BROADCAST_ENDED', 'Session ended · duration ' + formatTimer(state.timerSeconds || 0));
    if (typeof pushNotification === 'function') pushNotification('BROADCAST', 'Broadcast ended', 'info');
    if (typeof notifyBridgeState === 'function') notifyBridgeState();
  }, 400);
}


const state = {
  priority: 'PROGRAM', hold: false, transitioning: false, fadeDurationMs: 500, emergency: false, emergencyMode: null, emergencyMessage: 'Stand by for important information.', resumeSlots: null, resumePriority: 'PROGRAM', breaking: false, breakingText: '', breakingEndsAt: null, breakingTimer: null, breakingResumeSlots: null,
  broadcastState: 'offline', // offline | starting | live | stopping | ended
  timerSeconds: 0, viewerCount: 1248, peakViewers: 1248,
  viewerHistory: [1100,1120,1150,1180,1200,1220,1230,1240,1248],
  sessionTakes: 0,
  layout: '2x2',
  previewSlots: ['cam1','guest1','guest2','yt1'],
  programSlots: ['cam1','guest1','guest2','yt1'],
  selectedSlot: 0, sourceFilter: 'all',
  autoDirector: false, itemRemaining: 300, itemPaused: false,

  // MEDIA ENGINE (real local path)
  media: {
    localStream: null,
    screenStream: null,
    compositorActive: false,
    recording: false,
    mediaRecorder: null,
    recordedChunks: [],
    recStartedAt: null,
    animFrame: null,
  },
  recordings: [],

  graphics: {
    lt: { enabled: true, title: 'KENYA LAUNCHES NEW ECONOMIC REFORMS', subtitle: 'Government targets 6% GDP growth in 2026' },
    bn: { enabled: true, text: 'KENYA LAUNCHES NEW ECONOMIC REFORMS' },
    ticker: { enabled: true, text: 'NEWS · KENYA · BUSINESS · SPORTS · WEATHER · MARKETS · POLITICS' },
    live: { enabled: true },
    clock: { enabled: true },
    logo: { enabled: true, text: 'NEWS ROOM | TV' },
    loc: { enabled: true, text: 'NAIROBI' },
  },

  // Module 09 — Ads (marketplace lite → Program priority AD)
  ads: [
    { id: 'ad1', title: 'Safaricom Fibre — 30s', advertiser: 'Safaricom', campaign: 'Home Fibre Q3', dur: '00:30', durSec: 30, status: 'approved', priority: 1,
      startDate: '2026-09-01', endDate: '2026-12-31', dayStart: '06:00', dayEnd: '23:00', maxPerDay: 12, maxTotal: 200, minGapMin: 8, plays: 0, playsToday: 0, lastPlayedAt: null },
    { id: 'ad2', title: 'Equity Bank Business', advertiser: 'Equity', campaign: 'SME Drive', dur: '00:15', durSec: 15, status: 'approved', priority: 2,
      startDate: '2026-09-01', endDate: '2026-10-31', dayStart: '07:00', dayEnd: '21:00', maxPerDay: 10, maxTotal: 100, minGapMin: 15, plays: 0, playsToday: 0, lastPlayedAt: null },
    { id: 'ad3', title: 'Kenya Airways Promo', advertiser: 'KQ', campaign: 'Skyward', dur: '00:30', durSec: 30, status: 'pending', priority: 2,
      startDate: '2026-09-15', endDate: '2026-11-30', dayStart: '08:00', dayEnd: '22:00', maxPerDay: 6, maxTotal: 80, minGapMin: 20, plays: 0, playsToday: 0, lastPlayedAt: null },
    { id: 'ad4', title: 'Jumia Flash Sale', advertiser: 'Jumia', campaign: 'Weekend Flash', dur: '00:20', durSec: 20, status: 'approved', priority: 1,
      startDate: '2026-09-19', endDate: '2026-09-22', dayStart: '09:00', dayEnd: '23:59', maxPerDay: 20, maxTotal: 40, minGapMin: 5, plays: 0, playsToday: 0, lastPlayedAt: null },
  ],
  activeAd: null,
  adRemaining: 0,
  adFilter: 'all',
  currentView: 'studio',
  settings: {
    channelName: 'NEWS ROOM TV',
    tagline: "Kenya's Trusted News Channel",
    logoText: 'NEWS ROOM | TV',
    location: 'NAIROBI',
    defaultLayout: '2x2',
    autoDirectorOnLoad: false,
    bridgeUrl: 'ws://localhost:8787/bridge',
    bridgeStub: true,
    publicBaseUrl: '',
  },
  destLocal: { youtube: { url: '' }, facebook: { url: '' }, rtmp: { url: '' } },
  auditLog: [],
  joinInboxDismissed: {},
  notifications: [],
  notifUnread: 0,
  notifPanelOpen: false,

  currentUserId: 'u1',
  users: [
    { id: 'u1', name: 'Administrator', email: 'admin@newsroom.tv', role: 'owner', status: 'active' },
    { id: 'u2', name: 'Amina Director', email: 'amina@newsroom.tv', role: 'director', status: 'active' },
    { id: 'u3', name: 'James Producer', email: 'james@newsroom.tv', role: 'producer', status: 'active' },
    { id: 'u4', name: 'Graphics Desk', email: 'gfx@newsroom.tv', role: 'graphics', status: 'offline' },
    { id: 'u5', name: 'Audio Op', email: 'audio@newsroom.tv', role: 'audio', status: 'offline' },
  ],
  roleDefs: [
    { id: 'owner', label: 'Owner', desc: 'Full control' },
    { id: 'admin', label: 'Administrator', desc: 'System management' },
    { id: 'producer', label: 'Producer', desc: 'Production control' },
    { id: 'director', label: 'Director', desc: 'Program switching' },
    { id: 'news_director', label: 'News Director', desc: 'Rundown management' },
    { id: 'graphics', label: 'Graphics Operator', desc: 'Graphics control' },
    { id: 'audio', label: 'Audio Operator', desc: 'Audio control' },
    { id: 'guest_manager', label: 'Guest Manager', desc: 'Guest management' },
  ],

  audio: {
    master: { level: 80, mute: false, solo: false },
    channels: [
      { id: 'cam1', name: 'Camera 1', level: 75, mute: false, solo: false },
      { id: 'cam2', name: 'Camera 2', level: 70, mute: false, solo: false },
      { id: 'guest1', name: 'Guest 1', level: 78, mute: false, solo: false },
      { id: 'guest2', name: 'Guest 2', level: 72, mute: false, solo: false },
      { id: 'media', name: 'Media', level: 65, mute: false, solo: false },
      { id: 'ads', name: 'Ads', level: 70, mute: false, solo: false },
    ],
  },


  guests: [
    { id: 'g1', name: 'Dr. Amina Hassan', role: 'Analyst', status: 'connected', sourceId: 'guest1', token: 'tok_amina', tier: 'paid', paymentStatus: 'paid' },
    { id: 'g2', name: 'James Ochieng', role: 'Reporter', status: 'connected', sourceId: 'guest2', token: 'tok_james', tier: 'free', paymentStatus: 'n/a' },
    { id: 'g3', name: 'Sarah Kimani', role: 'Correspondent', status: 'lobby', sourceId: null, token: 'tok_sarah', tier: 'paid', paymentStatus: 'pending' },
    { id: 'g4', name: 'Open slot', role: 'Guest', status: 'available', sourceId: null, token: null, tier: 'free', paymentStatus: 'n/a' },
  ],

  sources: [
    { id: 'cam1', name: 'Camera 1 (Local)', type: 'camera', status: 'standby', res: '—', role: 'Host', color: '#1e40af', icon: '📷', hasStream: false },
    { id: 'cam2', name: 'Camera 2', type: 'camera', status: 'standby', res: '1080p30', role: 'Wide', color: '#1e3a5f', icon: '📷', hasStream: false },
    { id: 'cam3', name: 'Camera 3', type: 'camera', status: 'standby', res: '1080p30', role: 'Guest Angle', color: '#312e81', icon: '📷', hasStream: false },
    { id: 'remote1', name: 'Remote · Nairobi', type: 'remote', status: 'connected', res: '1080p30', role: 'Field', color: '#0f766e', icon: '📡', hasStream: false, shareToken: 'tok_remote_nairobi' },
    { id: 'guest1', name: 'Dr. Amina Hassan', type: 'guest', status: 'connected', res: '720p30', role: 'Analyst', color: '#5b21b6', icon: '👤', hasStream: false },
    { id: 'guest2', name: 'James Ochieng', type: 'guest', status: 'connected', res: '720p30', role: 'Reporter', color: '#5b21b6', icon: '👤', hasStream: false },
    { id: 'yt1', name: 'YouTube — Markets', type: 'youtube', status: 'standby', res: '1080p', role: 'External', color: '#991b1b', icon: '▶', hasStream: false, youtubeId: null, url: '' },
    { id: 'media1', name: 'Opening Package', type: 'media', status: 'ready', res: '1080p', role: 'Package', color: '#854d0e', icon: '🎬', hasStream: false, mediaUrl: null },
    { id: 'ad_spot', name: 'Ad Spot', type: 'media', status: 'ready', res: '1080p', role: 'Advertisement', color: '#b45309', icon: '📢', hasStream: false },
    { id: 'screen1', name: 'Screen Share', type: 'screen', status: 'standby', res: '—', role: 'Desktop', color: '#0e7490', icon: '🖥', hasStream: false },
  ],

  rundown: [
    { n: 1, type: 'Video', title: 'Opening News', dur: '02:30', durSec: 150, status: 'Completed', source: 'Camera 1', notes: 'Cold open' },
    { n: 2, type: 'Guest', title: 'Guest Interview', dur: '05:00', durSec: 300, status: 'Playing', source: 'Guest 1', notes: 'Introduce analyst — keep tight' },
    { n: 3, type: 'Video', title: 'Market Update', dur: '02:00', durSec: 120, status: 'Upcoming', source: 'YouTube', notes: '' },
    { n: 4, type: 'Ad', title: 'Advertisement', dur: '00:30', durSec: 30, status: 'Upcoming', source: 'Ads', notes: '30s spot' },
    { n: 5, type: 'Video', title: 'Weather Update', dur: '02:30', durSec: 150, status: 'Upcoming', source: 'Video', notes: '' },
    { n: 6, type: 'Video', title: 'Closing News', dur: '03:00', durSec: 180, status: 'Upcoming', source: 'Camera 1', notes: 'Sign off' },
  ],
};

const navItems = [
  { id: 'home', label: 'Home', icon: '⌂' }, { id: 'studio', label: 'Studio', icon: '▣', active: true },
  { id: 'news', label: 'News Director', icon: '🎬' }, { id: 'sources', label: 'Sources', icon: '📡' },
  { id: 'ads', label: 'Ads', icon: '📢' }, { id: 'graphics', label: 'Graphics', icon: '🗂' },
  { id: 'guests', label: 'Guests', icon: '👥' }, { id: 'destinations', label: 'Destinations', icon: '📤' },
  { id: 'analytics', label: 'Analytics', icon: '📊' }, { id: 'audio', label: 'Audio', icon: '🔊' },
  { id: 'recordings', label: 'Recordings', icon: '🎞' }, { id: 'users', label: 'Users', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function getSource(id) { return state.sources.find(s => s.id === id) || state.sources[0]; }

function isFileOrigin() {
  try { return location.protocol === 'file:'; } catch (e) { return false; }
}

function publicBaseUrl() {
  const s = (state.settings && state.settings.publicBaseUrl) || '';
  if (s && String(s).trim()) return String(s).trim().replace(/\/+$/, '');
  try {
    if (location.protocol === 'file:') return ''; // never build share links from file://
    const path = location.pathname.replace(/\/[^/]*$/, '/');
    return location.origin + (path || '/');
  } catch (e) {
    return '';
  }
}

function appPageUrl(page, query) {
  const base = publicBaseUrl();
  const qs = query ? ('?' + query) : '';
  if (base) {
    const slash = base.endsWith('/') ? '' : '/';
    return base + slash + page + qs;
  }
  // Relative path — works only if both pages are in the same folder over HTTP
  return page + qs;
}

function shareLinkWarningHtml() {
  if ((state.settings && state.settings.publicBaseUrl) || !isFileOrigin()) return '';
  return '<div class="text-[9px] text-amber-400 mt-1 leading-relaxed">You opened the app as a local file (file://). Share links will not work for other devices. Serve the folder over HTTP/HTTPS or set <b>Settings → Public site URL</b>.</div>';
}

function getPlayingItem() { return state.rundown.find(r => r.status === 'Playing' || r.status === 'Paused'); }

// ========== REAL MEDIA ENGINE ==========
async function startLocalCamera() {
  if (state.media.localStream) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: true
    });
    state.media.localStream = stream;
    const v = document.getElementById('local-cam-video');
    v.srcObject = stream;
    await v.play().catch(() => {});

    const cam = state.sources.find(s => s.id === 'cam1');
    if (cam) {
      cam.status = 'live';
      cam.hasStream = true;
      cam.res = (stream.getVideoTracks()[0]?.getSettings()?.height || 720) + 'p';
      cam.name = 'Camera 1 (Local LIVE)';
    }

    document.getElementById('pipe-capture').textContent = 'Live';
    document.getElementById('pipe-capture').className = 'text-green-400 font-semibold';
    document.getElementById('me-status-pill').textContent = 'CAMERA LIVE';
    document.getElementById('me-status-pill').className = 'text-[9px] px-1.5 py-0.5 rounded bg-green-900 border border-green-600 text-green-300 font-bold';
    document.getElementById('media-badge').textContent = 'CAMERA';
    document.getElementById('media-badge').className = 'px-2 py-0.5 rounded bg-green-900 border border-green-600 text-green-300 font-medium';
    document.getElementById('sidebar-media-sub').textContent = 'CAMERA LIVE';
    document.getElementById('btn-cam').textContent = '📷 Camera On';
    applyLocalAudioGain();

    // Auto-start compositor when camera is up
    if (!state.media.compositorActive) startCompositor();

    renderSources();
    renderPreview();
    // Put local cam on preview primary
    state.previewSlots[0] = 'cam1';
    renderPreview();
  } catch (err) {
    console.error(err);
    alert('Camera access failed: ' + (err.message || err) + '\n\nAllow camera permission and use HTTPS or localhost.');
  }
}

function stopLocalCamera() {
  if (state.media.recording) stopLocalRecord();
  if (state.media.localStream) {
    state.media.localStream.getTracks().forEach(t => t.stop());
    state.media.localStream = null;
  }
  const v = document.getElementById('local-cam-video');
  v.srcObject = null;
  const cam = state.sources.find(s => s.id === 'cam1');
  if (cam) { cam.status = 'standby'; cam.hasStream = false; cam.res = '—'; cam.name = 'Camera 1 (Local)'; }
  document.getElementById('pipe-capture').textContent = 'Off';
  document.getElementById('pipe-capture').className = 'text-slate-400 font-semibold';
  document.getElementById('btn-cam').innerHTML = '<span>📷</span> Start Camera';
  updateMediaStatusLabels();
  renderSources();
  renderPreview();
}


async function startScreenShare() {
  try {
    if (state.media.screenStream) {
      // Already sharing — put on preview
      selectSource('screen1');
      if (typeof renderSourcesPage === 'function') renderSourcesPage();
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    state.media.screenStream = stream;
    let src = state.sources.find(s => s.id === 'screen1');
    if (!src) {
      src = { id: 'screen1', name: 'Screen Share (LIVE)', type: 'screen', status: 'live', res: '1080p', role: 'Desktop', color: '#0e7490', icon: '🖥', hasStream: true };
      state.sources.push(src);
    } else {
      src.status = 'live';
      src.hasStream = true;
      src.name = 'Screen Share (LIVE)';
      const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
      if (settings.height) src.res = settings.height + 'p';
    }
    stream.getVideoTracks()[0].onended = () => stopScreenShare();
    if (!state.media.compositorActive) startCompositor();
    state.previewSlots = ['screen1'];
    setLayout('fullscreen');
    renderSources();
    renderPreview();
    if (typeof renderSourcesPage === 'function') renderSourcesPage();
    const btn = document.getElementById('btn-screen');
    if (btn) btn.innerHTML = '<span>🖥</span> Screen Live';
    const me = document.getElementById('me-btn-screen');
    if (me) me.textContent = 'Screen Live';
    audit('SOURCE_ADD', 'Screen share started');
    if (typeof pushNotification === 'function') pushNotification('SCREEN', 'Screen share live on Source Engine', 'ok');
  } catch (err) {
    console.error(err);
    if (err && err.name === 'NotAllowedError') return;
    alert('Screen share failed: ' + (err.message || err));
  }
}

function stopScreenShare() {
  if (state.media.screenStream) {
    state.media.screenStream.getTracks().forEach(t => t.stop());
    state.media.screenStream = null;
  }
  const src = state.sources.find(s => s.id === 'screen1');
  if (src) { src.status = 'standby'; src.hasStream = false; src.name = 'Screen Share'; }
  renderSources();
  renderPreview();
  if (typeof renderSourcesPage === 'function') renderSourcesPage();
  const btn = document.getElementById('btn-screen');
  if (btn) btn.innerHTML = '<span>🖥</span> Screen Share';
  const me = document.getElementById('me-btn-screen');
  if (me) me.textContent = 'Screen Share';
  audit('SOURCE_STOP', 'Screen share ended');
}

function resizeProgramCanvas() {
  const canvas = document.getElementById('program-canvas');
  const mon = document.getElementById('program-monitor');
  if (!canvas || !mon) return;
  const rect = mon.getBoundingClientRect();
  const w = Math.max(640, Math.floor(rect.width) || 640);
  const h = Math.max(360, Math.floor(rect.height) || 360);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function startCompositor() {
  const canvas = document.getElementById('program-canvas');
  resizeProgramCanvas();
  if (!state.media._resizeObs) {
    state.media._resizeObs = new ResizeObserver(() => resizeProgramCanvas());
    state.media._resizeObs.observe(document.getElementById('program-monitor'));
  }
  state.media.compositorActive = true;
  document.getElementById('pipe-compositor').textContent = 'Active';
  document.getElementById('pipe-compositor').className = 'text-green-400 font-semibold';
  document.getElementById('me-btn-comp').textContent = 'Composite On';
  if (state.media.animFrame) cancelAnimationFrame(state.media.animFrame);
  compositeLoop();
  updateMediaStatusLabels();
}

function compositeLoop() {
  if (!state.media.compositorActive) return;
  const canvas = document.getElementById('program-canvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const slots = state.programSlots;
  const layout = state.layout;
  const localVideo = document.getElementById('local-cam-video');
  const hasCam = state.media.localStream && localVideo.readyState >= 2;

  function drawVideoElement(video, x, y, sw, sh, src) {
    if (!video || video.readyState < 2) {
      fillPlaceholder(ctx, x, y, sw, sh, src);
      return;
    }
    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      const scale = Math.max(sw / vw, sh / vh);
      const dw = vw * scale, dh = vh * scale;
      ctx.drawImage(video, x + (sw - dw) / 2, y + (sh - dh) / 2, dw, dh);
    } catch (e) {
      fillPlaceholder(ctx, x, y, sw, sh, src);
    }
  }

  function ensureMediaVideo(src) {
    if (!src || !src.mediaUrl) return null;
    const vidId = 'comp-media-' + src.id;
    let v = document.getElementById(vidId);
    if (!v) {
      v = document.createElement('video');
      v.id = vidId;
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = 'auto';
      v.style.display = 'none';
      v.src = src.mediaUrl;
      document.body.appendChild(v);
    } else if (v.src !== src.mediaUrl && v.getAttribute('src') !== src.mediaUrl) {
      v.src = src.mediaUrl;
    }
    if (v.paused) v.play().catch(() => {});
    return v;
  }

  function drawSlot(srcId, x, y, sw, sh) {
    const src = getSource(srcId);
    if (srcId === 'cam1' && hasCam) {
      drawVideoElement(localVideo, x, y, sw, sh, src);
    } else if (srcId === 'screen1' && state.media.screenStream) {
      let sv = document.getElementById('local-screen-video');
      if (!sv) {
        sv = document.createElement('video');
        sv.id = 'local-screen-video';
        sv.autoplay = true; sv.playsInline = true; sv.muted = true;
        sv.style.display = 'none';
        document.body.appendChild(sv);
        sv.srcObject = state.media.screenStream;
        sv.play().catch(() => {});
      } else if (sv.srcObject !== state.media.screenStream) {
        sv.srcObject = state.media.screenStream;
        sv.play().catch(() => {});
      }
      drawVideoElement(sv, x, y, sw, sh, src);
    } else if (src && src.type === 'media' && src.mediaUrl) {
      const mv = ensureMediaVideo(src);
      drawVideoElement(mv, x, y, sw, sh, src);
    } else if (src && src.type === 'image' && src.imageUrl) {
      let img = document.getElementById('comp-img-' + src.id);
      if (!img) {
        img = new Image();
        img.id = 'comp-img-' + src.id;
        img.src = src.imageUrl;
        img.style.display = 'none';
        document.body.appendChild(img);
      }
      if (img.complete && img.naturalWidth) {
        try {
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const scale = Math.max(sw / iw, sh / ih);
          const dw = iw * scale, dh = ih * scale;
          ctx.drawImage(img, x + (sw - dw) / 2, y + (sh - dh) / 2, dw, dh);
        } catch (e) { fillPlaceholder(ctx, x, y, sw, sh, src); }
      } else {
        fillPlaceholder(ctx, x, y, sw, sh, src);
      }
    } else {
      fillPlaceholder(ctx, x, y, sw, sh, src);
    }
    // Label
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y + sh - 18, sw, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.fillText((src && src.name) || srcId, x + 6, y + sh - 5);
  }

  function fillPlaceholder(ctx, x, y, sw, sh, src) {
    const grd = ctx.createLinearGradient(x, y, x + sw, y + sh);
    grd.addColorStop(0, src.color + 'cc');
    grd.addColorStop(1, '#0f172a');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, sw, sh);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(src.icon, x + sw / 2, y + sh / 2 - 8);
    ctx.font = '12px sans-serif';
    ctx.fillText(src.name, x + sw / 2, y + sh / 2 + 14);
    ctx.textAlign = 'left';
  }

  if (layout === 'fullscreen' || slots.length === 1) {
    drawSlot(slots[0] || 'cam1', 0, 0, w, h);
  } else if (layout === '2way' || layout === 'host-guest') {
    const hw = Math.floor(w / 2);
    drawSlot(slots[0] || 'cam1', 0, 0, hw, h);
    drawSlot(slots[1] || 'guest1', hw, 0, w - hw, h);
  } else if (layout === '2x2') {
    const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
    drawSlot(slots[0] || 'cam1', 0, 0, hw, hh);
    drawSlot(slots[1] || 'guest1', hw, 0, w - hw, hh);
    drawSlot(slots[2] || 'guest2', 0, hh, hw, h - hh);
    drawSlot(slots[3] || 'yt1', hw, hh, w - hw, h - hh);
  } else if (layout === 'pip') {
    drawSlot(slots[0] || 'cam1', 0, 0, w, h);
    const pw = Math.floor(w * 0.28), ph = Math.floor(h * 0.28);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    drawSlot(slots[1] || 'guest1', w - pw - 12, h - ph - 12, pw, ph);
    ctx.strokeRect(w - pw - 12, h - ph - 12, pw, ph);
  }

  // PROGRAM badge
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(w / 2 - 36, 8, 72, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PROGRAM', w / 2, 19);
  ctx.textAlign = 'left';

  state.media.animFrame = requestAnimationFrame(compositeLoop);
}

function updateMediaStatusLabels() {
  const hasCam = !!state.media.localStream;
  const hasComp = state.media.compositorActive;
  if (hasCam && hasComp) {
    document.getElementById('sidebar-media-sub').textContent = 'LOCAL COMPOSITE';
    document.getElementById('media-badge').textContent = 'COMPOSITE';
    document.getElementById('media-badge').className = 'px-2 py-0.5 rounded bg-cyan-900 border border-cyan-600 text-cyan-300 font-medium';
    document.getElementById('me-status-pill').textContent = 'LOCAL COMPOSITE';
    document.getElementById('me-status-pill').className = 'text-[9px] px-1.5 py-0.5 rounded bg-cyan-900 border border-cyan-600 text-cyan-300 font-bold';
  } else if (hasCam) {
    document.getElementById('sidebar-media-sub').textContent = 'CAMERA LIVE';
  } else {
    document.getElementById('sidebar-media-sub').textContent = 'LOCAL ONLY';
    document.getElementById('media-badge').textContent = 'LOCAL';
    document.getElementById('media-badge').className = 'px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-medium';
    document.getElementById('me-status-pill').textContent = 'LOCAL ONLY';
    document.getElementById('me-status-pill').className = 'text-[9px] px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-bold';
  }
}

function toggleLocalRecord() {
  if (state.media.recording) {
    stopLocalRecord();
  } else {
    startLocalRecord();
  }
}

function startLocalRecord() {
  if (!state.media.compositorActive) startCompositor();
  const canvas = document.getElementById('program-canvas');
  let stream;
  try {
    stream = canvas.captureStream(30);
  } catch (e) {
    alert('Canvas capture not supported in this browser.');
    return;
  }
  // Mix in local audio if available
  if (state.media.localStream) {
    const audioTracks = state.media.localStream.getAudioTracks();
    audioTracks.forEach(t => stream.addTrack(t));
  }
  state.media.recordedChunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  try {
    state.media.mediaRecorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
  } catch (e) {
    state.media.mediaRecorder = new MediaRecorder(stream);
  }
  state.media.mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) state.media.recordedChunks.push(e.data);
  };
  state.media.mediaRecorder.onstop = () => {
    const blob = new Blob(state.media.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const started = state.media.recStartedAt || Date.now();
    const durationSec = Math.max(1, Math.round((Date.now() - started) / 1000));
    const name = 'Program-' + new Date(started).toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.webm';
    state.recordings.unshift({
      id: 'rec_' + Date.now(),
      name,
      startedAt: started,
      durationSec,
      sizeBytes: blob.size,
      type: 'program-local',
      mime: blob.type || 'video/webm',
      url
    });
    // Auto-download still available
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    document.getElementById('pipe-recorder').textContent = 'Idle';
    document.getElementById('pipe-recorder').className = 'text-slate-400 font-semibold';
    updateRecordingUI();
    renderRecordingsList();
  };
  state.media.recStartedAt = Date.now();
  state.media.mediaRecorder.start(1000);
  state.media.recording = true;
  document.getElementById('pipe-recorder').textContent = 'Recording';
  document.getElementById('pipe-recorder').className = 'text-red-400 font-semibold';
  document.getElementById('rec-indicator').textContent = '● REC';
  document.getElementById('rec-indicator').className = 'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border bg-red-600/20 border-red-500 text-red-400';
  document.getElementById('btn-rec').innerHTML = '<span>●</span> Stop Rec';
  document.getElementById('me-btn-rec').textContent = 'Stop Record';
  updateRecordingUI();
  audit('REC_START', 'Local Program recording');
}

function stopLocalRecord() {
  if (state.media.mediaRecorder && state.media.recording) {
    state.media.mediaRecorder.stop();
  }
  state.media.recording = false;
  document.getElementById('rec-indicator').textContent = 'REC OFF';
  document.getElementById('rec-indicator').className = 'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border bg-slate-800 border-slate-600 text-slate-400';
  document.getElementById('btn-rec').innerHTML = '<span>●</span> Local Rec';
  document.getElementById('me-btn-rec').textContent = 'Local Record';
  updateRecordingUI();
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function updateRecordingUI() {
  const active = !!state.media.recording;
  const pageStatus = document.getElementById('rec-page-status');
  const pageToggle = document.getElementById('rec-page-toggle');
  const statCount = document.getElementById('rec-stat-count');
  const statSize = document.getElementById('rec-stat-size');
  const statActive = document.getElementById('rec-stat-active');
  const statActiveSub = document.getElementById('rec-stat-active-sub');
  if (pageStatus) {
    pageStatus.textContent = active ? 'RECORDING' : 'Idle';
    pageStatus.className = 'text-[10px] px-2 py-0.5 rounded border font-semibold ' + (
      active ? 'bg-red-900 border-red-600 text-red-300' : 'bg-slate-800 border-slate-600 text-slate-300'
    );
  }
  if (pageToggle) {
    pageToggle.textContent = active ? '■ Stop local rec' : '● Start local rec';
    pageToggle.className = 'px-2.5 py-1 rounded text-white text-[10px] font-semibold ' + (
      active ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-700 hover:bg-red-600'
    );
  }
  if (statCount) statCount.textContent = String(state.recordings.length);
  if (statSize) {
    const total = state.recordings.reduce((s, r) => s + (r.sizeBytes || 0), 0);
    statSize.textContent = formatBytes(total);
  }
  if (statActive) {
    if (active && state.media.recStartedAt) {
      const sec = Math.max(0, Math.round((Date.now() - state.media.recStartedAt) / 1000));
      statActive.textContent = formatDur(sec);
      if (statActiveSub) statActiveSub.textContent = 'recording now';
    } else {
      statActive.textContent = '—';
      if (statActiveSub) statActiveSub.textContent = 'not recording';
    }
  }
}

function renderRecordingsList() {
  const body = document.getElementById('recordings-body');
  if (!body) return;
  if (!state.recordings.length) {
    body.innerHTML = '<tr><td colspan="6" class="px-3 py-6 text-center text-slate-500">No recordings yet. Start a local rec from Studio or here.</td></tr>';
    updateRecordingUI();
    return;
  }
  body.innerHTML = state.recordings.map(r => {
    const when = new Date(r.startedAt).toLocaleString();
    return '<tr class="border-t border-[#1e2a3a]/60 hover:bg-[#131a28]">' +
      '<td class="px-3 py-2 text-white font-medium">' + r.name + '</td>' +
      '<td class="px-2 py-2 text-slate-400">' + when + '</td>' +
      '<td class="px-2 py-2 font-mono text-slate-300">' + formatDur(r.durationSec || 0) + '</td>' +
      '<td class="px-2 py-2 text-slate-300">' + formatBytes(r.sizeBytes) + '</td>' +
      '<td class="px-2 py-2 text-slate-500">' + (r.type || 'local') + '</td>' +
      '<td class="px-2 py-2">' +
        '<div class="flex gap-1">' +
          '<button onclick="downloadRecording(\'' + r.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-800 text-white">Download</button>' +
          '<button onclick="deleteRecording(\'' + r.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Remove</button>' +
        '</div></td></tr>';
  }).join('');
  updateRecordingUI();
}

function downloadRecording(id) {
  const r = state.recordings.find(x => x.id === id);
  if (!r || !r.url) return;
  const a = document.createElement('a');
  a.href = r.url;
  a.download = r.name || 'recording.webm';
  a.click();
}

function deleteRecording(id) {
  const r = state.recordings.find(x => x.id === id);
  if (r && r.url) {
    try { URL.revokeObjectURL(r.url); } catch (e) {}
  }
  state.recordings = state.recordings.filter(x => x.id !== id);
  renderRecordingsList();
}

function clearRecordingLibrary() {
  if (!state.recordings.length) return;
  if (!confirm('Clear all session recordings from the list?')) return;
  state.recordings.forEach(r => {
    if (r.url) try { URL.revokeObjectURL(r.url); } catch (e) {}
  });
  state.recordings = [];
  renderRecordingsList();
}


// ========== LAYOUT / PROGRAM (UI tiles still used for Preview) ==========
function buildLayoutHTML(slots, isProgram) {
  // When compositor is active, Program monitor uses canvas; still draw lightweight overlay labels via program-content if needed
  if (isProgram && state.media.compositorActive) {
    return ''; // canvas handles Program
  }
  const layout = LAYOUTS[state.layout];
  const used = slots.slice(0, layout.slots);
  if (layout.slots === 1) return renderTile(getSource(used[0] || 'cam1'), isProgram, 0, true);
  if (state.layout === '2way' || state.layout === 'host-guest') {
    return '<div class="grid grid-cols-2 h-full gap-px bg-[#1e2a3a]">' + used.map((id,i) => renderTile(getSource(id), isProgram, i)).join('') + '</div>';
  }
  if (state.layout === '2x2') {
    return '<div class="grid grid-cols-2 grid-rows-2 h-full gap-px bg-[#1e2a3a]">' + used.map((id,i) => renderTile(getSource(id), isProgram, i)).join('') + '</div>';
  }
  if (state.layout === 'pip') {
    const main = getSource(used[0] || 'cam1'), pip = getSource(used[1] || 'guest1');
    return '<div class="relative h-full w-full">' + renderTile(main, isProgram, 0, true) +
      '<div class="absolute bottom-3 right-3 w-[28%] h-[28%] rounded border-2 border-white/70 overflow-hidden shadow-lg z-10">' + renderTile(pip, isProgram, 1, true) + '</div></div>';
  }
  return renderTile(getSource(used[0]), isProgram, 0, true);
}

function renderTile(src, isProgram, slotIndex, full) {
  const selected = !isProgram && state.selectedSlot === slotIndex;
  // Real video for cam1 in Preview when stream exists
  if (!isProgram && src.id === 'cam1' && state.media.localStream) {
    return '<div class="relative overflow-hidden ' + (full ? 'h-full w-full' : '') + ' ' + (selected ? 'slot-selected' : '') + ' cursor-pointer" onclick="selectSlot(' + slotIndex + ')">' +
      '<video class="media-tile" autoplay playsinline muted data-mirror="1"></video>' +
      '<div class="absolute bottom-1 left-1 text-[8px] px-1 rounded bg-black/50 text-green-300">LIVE CAM</div></div>';
  }
  return '<div class="relative overflow-hidden ' + (full ? 'h-full w-full' : '') + ' ' + (selected ? 'slot-selected' : '') + ' cursor-pointer" onclick="' + (isProgram ? '' : 'selectSlot(' + slotIndex + ')') + '" style="background: linear-gradient(145deg, ' + src.color + 'dd, #0f172a 85%);">' +
    '<div class="absolute inset-0 flex flex-col items-center justify-center"><div class="text-2xl mb-1">' + src.icon + '</div><div class="text-[11px] font-bold text-white text-center px-1 leading-tight">' + src.name + '</div><div class="text-[9px] text-slate-300">' + src.res + '</div></div>' +
    (isProgram && slotIndex === 0 ? '<div class="absolute top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-red-600 text-white text-[8px] font-black rounded">PROGRAM</div>' : '') +
    '<div class="absolute bottom-1 left-1 text-[8px] px-1 rounded bg-black/50 text-slate-300">' + (LAYOUTS[state.layout].labels[slotIndex] || '') + '</div></div>';
}

function attachPreviewVideos() {
  if (!state.media.localStream) return;
  document.querySelectorAll('#preview-content video[data-mirror]').forEach(v => {
    if (v.srcObject !== state.media.localStream) {
      v.srcObject = state.media.localStream;
      v.play().catch(() => {});
    }
  });
}

function renderPreview() {
  document.getElementById('preview-content').innerHTML = buildLayoutHTML(state.previewSlots, false);
  document.getElementById('preview-layout-label').textContent = LAYOUTS[state.layout].name;
  attachPreviewVideos();
}

function renderProgram() {
  if (state.priority === 'EMERGENCY' || state.priority === 'BREAKING') return;
  document.getElementById('program-content').innerHTML = buildLayoutHTML(state.programSlots, true);
  document.getElementById('program-layout-label').textContent = LAYOUTS[state.layout].name;
  applyGraphicsToProgram();
  updateProgramEngineUI();
}

// ========== SWITCHER / ACTIONS ==========
function selectSource(id) {
  state.previewSlots[state.selectedSlot] = id;
  const needed = LAYOUTS[state.layout].slots;
  while (state.previewSlots.length < needed) state.previewSlots.push('cam1');
  state.previewSlots = state.previewSlots.slice(0, needed);
  renderPreview(); renderSources();
  document.getElementById('source-select').value = id;
}
function selectSlot(i) { state.selectedSlot = i; renderPreview(); }
function setLayout(name) {
  state.layout = name;
  const needed = LAYOUTS[name].slots;
  while (state.previewSlots.length < needed) state.previewSlots.push(state.previewSlots[0] || 'cam1');
  while (state.programSlots.length < needed) state.programSlots.push(state.programSlots[0] || 'cam1');
  state.previewSlots = state.previewSlots.slice(0, needed);
  state.programSlots = state.programSlots.slice(0, needed);
  state.selectedSlot = 0;
  document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('layout-active', b.dataset.layout === name));
  renderPreview(); renderProgram();
}
function audit(action, detail) {
  const user = (state.users || []).find(u => u.id === state.currentUserId);
  const entry = {
    ts: Date.now(),
    time: new Date().toLocaleTimeString(),
    action: action,
    detail: detail || '',
    user: user ? user.name : 'Operator'
  };
  state.auditLog = state.auditLog || [];
  state.auditLog.unshift(entry);
  if (state.auditLog.length > 200) state.auditLog.length = 200;
  if (state.currentView === 'settings') renderAuditLog();
  // Surface high-signal actions as notifications
  const notifyActions = {
    EMERGENCY_ON: 'error',
    EMERGENCY_OFF: 'ok',
    BREAKING: 'warn',
    AD_PLAY: 'info',
    AD_STOP: 'info',
    GUEST_ADMIT: 'ok',
    REC_START: 'warn',
    DEST_START: 'info',
    BLACK: 'warn'
  };
  if (notifyActions[action]) {
    pushNotification(action, detail || action, notifyActions[action]);
  }
}

function pushNotification(title, body, kind) {
  kind = kind || 'info';
  state.notifications = state.notifications || [];
  const n = {
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    ts: Date.now(),
    time: new Date().toLocaleTimeString(),
    title: title,
    body: body || '',
    kind: kind,
    read: false
  };
  state.notifications.unshift(n);
  if (state.notifications.length > 50) state.notifications.length = 50;
  state.notifUnread = (state.notifUnread || 0) + 1;
  renderNotifBadge();
  if (state.notifPanelOpen) renderNotifList();
  showToast(title, body, kind);
}

function showToast(title, body, kind) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const colors = {
    error: 'border-red-600 bg-red-950/95 text-red-100',
    warn: 'border-amber-600 bg-amber-950/95 text-amber-100',
    ok: 'border-green-600 bg-green-950/95 text-green-100',
    info: 'border-cyan-700 bg-cyan-950/95 text-cyan-100'
  };
  const el = document.createElement('div');
  el.className = 'pointer-events-auto px-3 py-2 rounded-lg border shadow-lg text-[11px] ' + (colors[kind] || colors.info);
  el.innerHTML = '<div class="font-bold">' + (title || '') + '</div>' +
    (body ? '<div class="opacity-90 mt-0.5">' + body + '</div>' : '');
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 320);
  }, 3200);
}

function renderNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const n = state.notifUnread || 0;
  if (n > 0) {
    badge.classList.remove('hidden');
    badge.textContent = n > 9 ? '9+' : String(n);
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!(state.notifications && state.notifications.length)) {
    list.innerHTML = '<div class="px-3 py-4 text-slate-500 text-center">No notifications</div>';
    return;
  }
  const kindColor = { error: 'text-red-400', warn: 'text-amber-400', ok: 'text-green-400', info: 'text-cyan-400' };
  list.innerHTML = state.notifications.map(n =>
    '<div class="px-3 py-2 border-t border-[#1e2a3a]/50 hover:bg-[#131a28] ' + (n.read ? 'opacity-60' : '') + '">' +
      '<div class="flex items-center justify-between gap-2">' +
        '<span class="font-semibold ' + (kindColor[n.kind] || 'text-slate-200') + '">' + n.title + '</span>' +
        '<span class="text-[9px] text-slate-600 font-mono">' + n.time + '</span></div>' +
      (n.body ? '<div class="text-slate-400 mt-0.5">' + n.body + '</div>' : '') +
    '</div>'
  ).join('');
}

function toggleNotifPanel() {
  state.notifPanelOpen = !state.notifPanelOpen;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !state.notifPanelOpen);
  if (state.notifPanelOpen) {
    state.notifications.forEach(n => { n.read = true; });
    state.notifUnread = 0;
    renderNotifBadge();
    renderNotifList();
  }
}

function clearNotifications() {
  state.notifications = [];
  state.notifUnread = 0;
  renderNotifBadge();
  renderNotifList();
}

// Close panel on outside click
document.addEventListener('click', (e) => {
  if (!state.notifPanelOpen) return;
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
    state.notifPanelOpen = false;
    panel.classList.add('hidden');
  }
});


function renderAuditLog() {
  const list = document.getElementById('audit-log-list');
  const count = document.getElementById('audit-count');
  if (count) count.textContent = (state.auditLog || []).length + ' events';
  if (!list) return;
  if (!(state.auditLog && state.auditLog.length)) {
    list.innerHTML = '<div class="px-3 py-4 text-slate-500 text-center">No operator actions yet</div>';
    return;
  }
  list.innerHTML = state.auditLog.map(e =>
    '<div class="px-3 py-1.5 border-t border-[#1e2a3a]/50 flex gap-2 hover:bg-[#131a28]">' +
      '<span class="font-mono text-[10px] text-slate-500 w-16 shrink-0">' + e.time + '</span>' +
      '<span class="text-cyan-300/90 font-medium w-28 shrink-0 truncate">' + e.action + '</span>' +
      '<span class="text-slate-300 flex-1 truncate">' + (e.detail || '') + '</span>' +
      '<span class="text-[9px] text-slate-600 shrink-0">' + (e.user || '') + '</span></div>'
  ).join('');
}

function clearAuditLog() {
  if (!state.auditLog || !state.auditLog.length) return;
  if (!confirm('Clear audit log for this session?')) return;
  state.auditLog = [];
  renderAuditLog();
}

function doCut() {
  completeTake({ type: 'CUT', durationMs: 0 });
}

function getFadeDurationMs() {
  const el = document.getElementById('fade-duration');
  if (el) {
    const n = parseInt(el.value, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return state.fadeDurationMs || 500;
}

function completeTake(transition) {
  if (state.priority === 'EMERGENCY') {
    if (typeof pushNotification === 'function') pushNotification('TAKE', 'Blocked — Emergency active', 'error');
    state.transitioning = false;
    return;
  }
  if (state.hold) {
    if (typeof pushNotification === 'function') pushNotification('TAKE', 'Blocked — release HOLD first', 'warn');
    state.transitioning = false;
    return;
  }
  state.sessionTakes = (state.sessionTakes || 0) + 1;
  if (state.activeAd && state.priority === 'AD') {
    stopAd();
  }
  state.programSlots = [...state.previewSlots];
  setPriority(state.breaking ? 'BREAKING' : 'PROGRAM');
  renderProgram();
  renderSources();
  if (transition && transition.type === 'CUT') {
    const mon = document.getElementById('program-monitor');
    if (mon) {
      mon.classList.add('take-flash');
      setTimeout(() => mon.classList.remove('take-flash'), 400);
    }
  }
  notifyBridgeTake(transition || { type: 'CUT', durationMs: 0 });
  if (!state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
  (state.programSlots || []).forEach(id => {
    const s = getSource(id);
    if (s && s.type === 'media' && s.mediaUrl) {
      const v = document.getElementById('comp-media-' + id);
      if (v) { try { v.currentTime = 0; v.play(); } catch (e) {} }
    }
  });
  const names = (state.programSlots || []).map(id => { const s = getSource(id); return s ? s.name : id; }).join(', ');
  const label = (transition && transition.type === 'FADE') ? 'FADE' : 'TAKE';
  audit(label, names || 'Program update' + (transition && transition.durationMs ? ' (' + transition.durationMs + 'ms)' : ''));
  state.transitioning = false;
  const btn = document.getElementById('btn-fade');
  if (btn) btn.disabled = false;
}

function doTake() {
  if (state.transitioning) return;
  completeTake({ type: 'CUT', durationMs: 0 });
}

function doFade() {
  if (state.priority === 'EMERGENCY') {
    if (typeof pushNotification === 'function') pushNotification('FADE', 'Blocked — Emergency active', 'error');
    return;
  }
  if (state.hold) {
    if (typeof pushNotification === 'function') pushNotification('FADE', 'Blocked — release HOLD first', 'warn');
    return;
  }
  if (state.transitioning) return;

  const dur = getFadeDurationMs();
  state.fadeDurationMs = dur;
  state.transitioning = true;
  const btn = document.getElementById('btn-fade');
  if (btn) btn.disabled = true;

  const curtain = document.getElementById('fade-curtain');
  if (!curtain || dur <= 0) {
    completeTake({ type: 'FADE', durationMs: dur });
    return;
  }

  const half = Math.max(50, Math.floor(dur / 2));
  curtain.classList.remove('hidden');
  curtain.style.transition = 'opacity ' + half + 'ms ease-in';
  curtain.style.opacity = '0';
  // force reflow
  void curtain.offsetWidth;
  curtain.style.opacity = '1';

  setTimeout(() => {
    // Mid-fade: switch Program sources under black
    if (state.activeAd && state.priority === 'AD') {
      try { stopAd(); } catch (e) {}
    }
    state.programSlots = [...state.previewSlots];
    setPriority(state.breaking ? 'BREAKING' : 'PROGRAM');
    renderProgram();
    renderSources();
    if (!state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
    (state.programSlots || []).forEach(id => {
      const s = getSource(id);
      if (s && s.type === 'media' && s.mediaUrl) {
        const v = document.getElementById('comp-media-' + id);
        if (v) { try { v.currentTime = 0; v.play(); } catch (e) {} }
      }
    });

    curtain.style.transition = 'opacity ' + half + 'ms ease-out';
    void curtain.offsetWidth;
    curtain.style.opacity = '0';
    setTimeout(() => {
      curtain.classList.add('hidden');
      notifyBridgeTake({ type: 'FADE', durationMs: dur });
      const names = (state.programSlots || []).map(id => { const s = getSource(id); return s ? s.name : id; }).join(', ');
      state.sessionTakes = (state.sessionTakes || 0) + 1;
      audit('FADE', (names || 'Program update') + ' (' + dur + 'ms)');
      state.transitioning = false;
      if (btn) btn.disabled = false;
    }, half + 20);
  }, half);
}

function doBlack() {
  state.media.compositorActive = false;
  if (state.media.animFrame) cancelAnimationFrame(state.media.animFrame);
  const canvas = document.getElementById('program-canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  document.getElementById('program-content').innerHTML = '<div class="absolute inset-0 bg-black flex items-center justify-center"><div class="text-slate-600 tracking-widest text-sm">BLACK</div></div>';
  audit('BLACK', 'Program to black');
}
function doHold() {
  state.hold = !state.hold;
  updateHoldUI();
if (typeof updateBroadcastUI === 'function') updateBroadcastUI();
  if (typeof updateProgramEngineUI === 'function') updateProgramEngineUI();
  if (typeof notifyBridgeState === 'function') notifyBridgeState();
  audit(state.hold ? 'HOLD_ON' : 'HOLD_OFF', state.hold ? 'Program held — TAKE blocked' : 'Program released');
  if (typeof pushNotification === 'function') {
    pushNotification('HOLD', state.hold ? 'Program frozen — TAKE disabled' : 'Program released', state.hold ? 'warn' : 'ok');
  }
}

function updateHoldUI() {
  const overlay = document.getElementById('hold-overlay');
  if (overlay) overlay.classList.toggle('hidden', !state.hold);
  // Studio HOLD buttons
  document.querySelectorAll('button[onclick="doHold()"]').forEach(btn => {
    if (state.hold) {
      btn.classList.add('ring-2', 'ring-amber-400');
      if (btn.textContent.trim() === 'HOLD') btn.textContent = 'HOLD ON';
    } else {
      btn.classList.remove('ring-2', 'ring-amber-400');
      if (btn.textContent.trim() === 'HOLD ON') btn.textContent = 'HOLD';
    }
  });
  const badge = document.getElementById('priority-badge');
  if (badge && state.hold && state.priority !== 'EMERGENCY') {
    badge.textContent = 'HOLD';
    badge.className = 'px-2 py-0.5 rounded bg-amber-800 border border-amber-500 text-amber-100 font-bold';
  } else if (badge && !state.hold && typeof updateProgramEngineUI === 'function') {
    updateProgramEngineUI();
  }
}


function activateEmergency(mode) {
  mode = mode || 'full';
  const input = document.getElementById('emergency-msg-input');
  const msg = (input && input.value.trim()) || state.emergencyMessage || 'Stand by for important information.';
  if (!state.emergency) {
    state.resumeSlots = [...(state.programSlots || [])];
    state.resumePriority = state.priority || 'PROGRAM';
  }
  state.emergency = true;
  state.emergencyMode = mode;
  state.emergencyMessage = msg;
  // Stop ads under emergency
  if (state.activeAd && typeof stopAd === 'function') {
    try { stopAd(); } catch (e) {}
  }
  setPriority('EMERGENCY');
  const overlay = document.getElementById('emergency-overlay');
  if (overlay) overlay.classList.remove('hidden');
  const br = document.getElementById('breaking-overlay');
  if (br) br.classList.add('hidden');
  const modeEl = document.getElementById('emergency-mode-label');
  if (modeEl) modeEl.textContent = mode === 'message' ? 'Message takeover' : mode === 'black' ? 'Emergency black' : 'Full takeover';
  const msgEl = document.getElementById('emergency-message');
  if (msgEl) msgEl.textContent = msg;
  const btn = document.getElementById('btn-emergency');
  if (btn) btn.classList.add('ring-2', 'ring-red-400');
  updateProgramEngineUI();
  notifyBridgeState && notifyBridgeState();
  audit('EMERGENCY_ON', mode + ': ' + msg);
}

function clearEmergency() {
  if (!state.emergency && !document.getElementById('emergency-overlay')?.classList.contains('hidden') === false) {
    // still try clear
  }
  state.emergency = false;
  state.emergencyMode = null;
  const overlay = document.getElementById('emergency-overlay');
  if (overlay) overlay.classList.add('hidden');
  if (state.resumeSlots) {
    state.programSlots = state.resumeSlots;
    state.resumeSlots = null;
  }
  const p = state.breaking ? 'BREAKING' : (state.resumePriority || 'PROGRAM');
  setPriority(p);
  if (state.media && !state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
  renderProgram();
  const btn = document.getElementById('btn-emergency');
  if (btn) btn.classList.remove('ring-2', 'ring-red-400');
  updateProgramEngineUI();
  notifyBridgeState && notifyBridgeState();
  audit('EMERGENCY_OFF', 'Resumed previous program');
}

function toggleEmergency() {
  if (state.emergency) clearEmergency();
  else activateEmergency('full');
}
function triggerBreaking() {
  if (state.priority === 'EMERGENCY' || state.emergency) return;

  const input = document.getElementById('breaking-msg-input');
  const text = (input && input.value.trim()) || (state.graphics.bn && state.graphics.bn.text) || state.breakingText || 'Major development';
  const durEl = document.getElementById('breaking-duration');
  const durSec = durEl ? Math.max(0, parseInt(durEl.value, 10) || 0) : 0;

  // Preserve program under breaking (separate from emergency resume)
  if (!state.breaking) {
    state.breakingResumeSlots = [...(state.programSlots || [])];
  }
  state.breaking = true;
  state.breakingText = text;
  if (state.graphics.bn) {
    state.graphics.bn.enabled = true;
    state.graphics.bn.text = text;
  }
  if (typeof updateToggleUI === 'function') updateToggleUI('bn');

  // Ads yield to breaking
  if (state.activeAd && state.priority === 'AD' && typeof stopAd === 'function') {
    try { stopAd(); } catch (e) {}
  }

  setPriority('BREAKING');
  const textEl = document.getElementById('breaking-overlay-text');
  if (textEl) textEl.textContent = text;
  const overlay = document.getElementById('breaking-overlay');
  if (overlay) overlay.classList.remove('hidden');

  // Auto-return timer
  if (state.breakingTimer) {
    clearInterval(state.breakingTimer);
    state.breakingTimer = null;
  }
  const cd = document.getElementById('breaking-countdown');
  if (durSec > 0) {
    state.breakingEndsAt = Date.now() + durSec * 1000;
    if (cd) {
      cd.classList.remove('hidden');
      cd.textContent = 'Returns in ' + durSec + 's';
    }
    state.breakingTimer = setInterval(() => {
      if (!state.breaking) {
        clearInterval(state.breakingTimer);
        state.breakingTimer = null;
        return;
      }
      const left = Math.max(0, Math.ceil((state.breakingEndsAt - Date.now()) / 1000));
      if (cd) cd.textContent = left > 0 ? ('Returns in ' + left + 's') : 'Returning…';
      if (left <= 0) clearBreaking();
    }, 250);
  } else {
    state.breakingEndsAt = null;
    if (cd) {
      cd.classList.add('hidden');
      cd.textContent = '';
    }
  }

  if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram();
  updateProgramEngineUI();
  if (typeof notifyBridgeState === 'function') notifyBridgeState();
  audit('BREAKING', text + (durSec ? ' (' + durSec + 's)' : ''));
  if (typeof pushNotification === 'function') pushNotification('BREAKING', text, 'warn');
}

function clearBreaking() {
  if (state.breakingTimer) {
    clearInterval(state.breakingTimer);
    state.breakingTimer = null;
  }
  state.breaking = false;
  state.breakingEndsAt = null;
  const overlay = document.getElementById('breaking-overlay');
  if (overlay) overlay.classList.add('hidden');
  const cd = document.getElementById('breaking-countdown');
  if (cd) {
    cd.classList.add('hidden');
    cd.textContent = '';
  }
  // Restore program bus if we saved it and not in emergency
  if (!state.emergency && state.breakingResumeSlots) {
    state.programSlots = state.breakingResumeSlots;
    state.breakingResumeSlots = null;
  }
  if (!state.emergency) {
    setPriority(state.activeAd ? 'AD' : 'PROGRAM');
    if (typeof renderProgram === 'function') renderProgram();
  }
  updateProgramEngineUI();
  if (typeof notifyBridgeState === 'function') notifyBridgeState();
  audit('BREAKING_CLEAR', 'Returned to program');
}

// News Director
function updateNewsDirectorUI() {
  const item = getPlayingItem();
  if (!item) {
    document.getElementById('nd-title-bar').textContent = 'Now: —';
    document.getElementById('item-countdown').textContent = '--:--';
    return;
  }
  document.getElementById('nd-title-bar').textContent = 'Now: ' + item.title;
  document.getElementById('item-countdown').textContent = formatDur(state.itemRemaining);
}
function renderRundownTable() {
  const colors = { Completed: 'text-slate-500', Playing: 'text-green-400', Paused: 'text-amber-400', Upcoming: 'text-blue-400', Skipped: 'text-slate-600' };
  document.getElementById('rundown-body').innerHTML = state.rundown.map((r, idx) =>
    '<tr class="border-t border-[#1e2a3a]/50 ' + (r.status === 'Playing' ? 'row-playing' : '') + ' cursor-pointer hover:bg-[#131a28]" onclick="jumpToRundownItem(' + idx + ')">' +
    '<td class="px-2 py-1.5 text-slate-500">' + r.n + '</td><td class="px-1 py-1.5">' + r.type + '</td><td class="px-1 py-1.5 text-white font-medium">' + r.title + '</td>' +
    '<td class="px-1 py-1.5 font-mono text-[10px]">' + r.dur + '</td><td class="px-1 py-1.5 ' + (colors[r.status] || '') + '">' + r.status + '</td>' +
    '<td class="px-1 py-1.5 text-slate-400">' + r.source + '</td><td class="px-1 py-1.5 text-slate-500 text-[9px] truncate max-w-[100px]">' + (r.notes || '—') + '</td></tr>'
  ).join('');
  if (typeof renderNewsDirectorPage === 'function') renderNewsDirectorPage();

}
function executeItem(item) {
  const srcId = SOURCE_MAP[item.source] || 'cam1';
  if (item.type === 'Ad') {
    item.status = 'Playing';
    state.itemRemaining = item.durSec;
    state.itemPaused = false;
    updateNewsDirectorUI();
    renderRundownTable();
    const linked = item.adId && state.ads.find(a => a.id === item.adId);
    const ad = (linked && linked.status === 'approved') ? linked : pickNextScheduledAd() || state.ads.find(a => a.status === 'approved');
    if (ad) playAd(ad.id);
    else {
      setLayout('fullscreen');
      state.previewSlots = ['ad_spot'];
      doTake();
      setPriority('AD');
    }
    return;
  }
  // Leaving an ad via rundown advance
  if (state.activeAd) stopAd();
  if (item.type === 'Guest') { setLayout('host-guest'); state.previewSlots = ['cam1', srcId]; }
  else if (/opening|closing/i.test(item.title)) { setLayout('fullscreen'); state.previewSlots = [srcId]; }
  else { state.previewSlots[0] = srcId; }
  renderPreview(); doTake();
  state.itemRemaining = item.durSec; state.itemPaused = false;
  item.status = 'Playing';
  updateNewsDirectorUI(); renderRundownTable();
}
function rundownNext() {
  if (state.emergency || state.priority === 'EMERGENCY') {
    if (typeof pushNotification === 'function') pushNotification('AUTO', 'Blocked during emergency', 'warn');
    return;
  }
  autoDirectorStep(true);
}

function autoDirectorStep(manual) {
  if (state.emergency || state.priority === 'EMERGENCY') return;
  // Breaking: do not auto-advance under breaking overlay
  if (state.breaking && !manual) return;

  state.rundown.forEach(r => {
    if (r.status === 'Playing' || r.status === 'Paused') r.status = 'Completed';
  });
  const next = state.rundown.find(r => r.status === 'Upcoming');
  const st = document.getElementById('auto-status');
  if (!next) {
    if (st) st.textContent = 'Rundown complete';
    state.autoDirector = false;
    state.itemPaused = false;
    const a1 = document.getElementById('auto-director');
    const a2 = document.getElementById('nd-auto');
    if (a1) a1.checked = false;
    if (a2) a2.checked = false;
    updateNewsDirectorUI();
    renderRundownTable();
    audit('AUTO_COMPLETE', 'Rundown finished');
    if (typeof pushNotification === 'function') pushNotification('AUTO', 'Rundown complete — Auto disarmed', 'info');
    return;
  }
  executeItem(next);
  if (st) st.textContent = (manual ? 'Next: ' : 'Auto: ') + next.title;
  audit(manual ? 'RUNDOWN_NEXT' : 'AUTO_STEP', next.title);
  if (typeof renderNewsDirectorPage === 'function') renderNewsDirectorPage();
}

function jumpToRundownItem(idx) {
  state.rundown.forEach((r, i) => {
    if (i < idx) r.status = 'Completed';
    else if (i === idx) r.status = 'Playing';
    else if (r.status !== 'Skipped') r.status = 'Upcoming';
  });
  executeItem(state.rundown[idx]);
  audit('RUNDOWN_JUMP', state.rundown[idx] ? state.rundown[idx].title : String(idx));
}

function toggleAutoDirector(on) {
  state.autoDirector = !!on;
  if (on) state.itemPaused = false;
  const st = document.getElementById('auto-status');
  if (st) st.textContent = on ? 'Timed Auto armed' : 'Auto idle';
  const a1 = document.getElementById('auto-director');
  const a2 = document.getElementById('nd-auto');
  if (a1) a1.checked = !!on;
  if (a2) a2.checked = !!on;
  audit(on ? 'AUTO_ARM' : 'AUTO_DISARM', on ? 'Timed Auto Director armed' : 'Disarmed');
  if (typeof renderNewsDirectorPage === 'function') renderNewsDirectorPage();
}

function setAutoDirector(on) { toggleAutoDirector(on); }

function pauseRundownItem() {
  const item = getPlayingItem();
  if (!item) return;
  state.itemPaused = true;
  item.status = 'Paused';
  const st = document.getElementById('auto-status');
  if (st) st.textContent = 'Clock paused: ' + item.title;
  updateNewsDirectorUI();
  renderRundownTable();
  audit('RUNDOWN_PAUSE', item.title);
}

function resumeRundownItem() {
  const item = state.rundown.find(r => r.status === 'Paused') || getPlayingItem();
  if (!item) return;
  state.itemPaused = false;
  item.status = 'Playing';
  const st = document.getElementById('auto-status');
  if (st) st.textContent = (state.autoDirector ? 'Auto: ' : 'Playing: ') + item.title;
  updateNewsDirectorUI();
  renderRundownTable();
  audit('RUNDOWN_RESUME', item.title);
}
function openAddItemModal() {
  document.getElementById('item-edit-idx').value = '-1';
  document.getElementById('item-title').value = '';
  document.getElementById('item-dur').value = '02:00';
  document.getElementById('item-notes').value = '';
  document.getElementById('item-modal').classList.remove('hidden');
}
function openItemModal(idx) {
  if (idx == null || idx < 0) return openAddItemModal();
  const r = state.rundown[idx];
  if (!r) return openAddItemModal();
  document.getElementById('item-edit-idx').value = String(idx);
  document.getElementById('item-title').value = r.title || '';
  document.getElementById('item-dur').value = r.dur || '02:00';
  document.getElementById('item-notes').value = r.notes || '';
  const typeEl = document.getElementById('item-type');
  if (typeEl) typeEl.value = r.type || 'Video';
  const srcEl = document.getElementById('item-source');
  if (srcEl && r.source) srcEl.value = r.source;
  document.getElementById('item-modal').classList.remove('hidden');
}
function closeItemModal() { document.getElementById('item-modal').classList.add('hidden'); }
function saveRundownItem() {
  const idx = parseInt(document.getElementById('item-edit-idx').value, 10);
  const type = document.getElementById('item-type').value;
  const title = document.getElementById('item-title').value.trim() || 'Untitled';
  const dur = document.getElementById('item-dur').value || '02:00';
  const source = document.getElementById('item-source').value;
  const notes = document.getElementById('item-notes').value.trim();
  const durSec = parseDur(dur);
  if (idx >= 0 && idx < state.rundown.length) {
    Object.assign(state.rundown[idx], { type, title, dur, durSec, source, notes });
  } else {
    state.rundown.push({ n: state.rundown.length + 1, type, title, dur, durSec, status: 'Upcoming', source, notes });
  }
  state.rundown.forEach((r, i) => { r.n = i + 1; });
  closeItemModal(); renderRundownTable();
}

// Graphics / Program UI
function toggleGraphic(key) {
  if (!state.graphics[key]) return;
  state.graphics[key].enabled = !state.graphics[key].enabled;
  updateToggleUI(key);
  applyGraphicsToProgram();
  notifyBridgeState();
}
function updateToggleUI(key) {
  const btn = document.getElementById('tog-' + key); if (!btn) return;
  const on = !!(state.graphics[key] && state.graphics[key].enabled);
  const small = btn.className.includes('w-6');
  btn.className = 'relative ' + (small ? 'w-6 h-3' : 'w-7 h-3.5') + ' rounded-full ' + (on ? 'bg-blue-600' : 'bg-slate-600');
  const knob = btn.querySelector('span');
  if (knob) {
    knob.className = 'absolute top-0.5 ' + (on ? (small ? 'left-3' : 'left-3.5') : 'left-0.5') + ' ' + (small ? 'w-2 h-2' : 'w-2.5 h-2.5') + ' rounded-full bg-white';
  }
}
function updateGfxField(layer, field, value) {
  if (!state.graphics[layer]) state.graphics[layer] = { enabled: true };
  state.graphics[layer][field] = value;
  applyGraphicsToProgram();
}
function syncGfxEditors() {
  const g = state.graphics;
  const set = (id, val) => { const el = document.getElementById(id); if (el && el.value !== val) el.value = val || ''; };
  set('gfx-edit-lt-title', g.lt.title);
  set('gfx-edit-lt-sub', g.lt.subtitle);
  set('gfx-edit-bn', g.bn.text);
  set('gfx-edit-ticker', g.ticker.text);
  set('gfx-edit-loc', g.loc.text);
  set('gfx-edit-logo', g.logo.text);
}
function applyGraphicsToProgram() {
  const g = state.graphics;
  const map = { lt: 'gfx-lowerthird', bn: 'gfx-breaking', ticker: 'gfx-ticker', live: 'gfx-live', clock: 'gfx-clock', logo: 'gfx-logo', loc: 'gfx-location' };
  tickProgramClock();
  Object.keys(map).forEach(k => {
    const el = document.getElementById(map[k]);
    if (el) el.style.display = (g[k] && g[k].enabled) ? '' : 'none';
  });
  const ltTitle = document.getElementById('gfx-lt-title');
  const ltSub = document.getElementById('gfx-lt-subtitle');
  const bn = document.getElementById('gfx-breaking-text');
  const bnOverlay = document.getElementById('breaking-overlay-text');
  const loc = document.getElementById('gfx-loc-text');
  const logo = document.getElementById('gfx-logo-text');
  const tick = document.getElementById('gfx-ticker-text');
  const tick2 = document.getElementById('gfx-ticker-text-2');
  if (ltTitle) ltTitle.textContent = g.lt.title || '';
  if (ltSub) ltSub.textContent = g.lt.subtitle || '';
  if (bn) bn.textContent = g.bn.text || '';
  if (bnOverlay) bnOverlay.textContent = g.bn.text || '';
  if (loc) loc.textContent = g.loc.text || '';
  if (logo) logo.textContent = g.logo.text || '';
  if (tick) tick.textContent = g.ticker.text || '';
  if (tick2) tick2.textContent = g.ticker.text || '';
}
function tickProgramClock() {
  const el = document.getElementById('gfx-clock');
  if (!el) return;
  const on = state.graphics && state.graphics.clock && state.graphics.clock.enabled;
  el.style.display = on ? '' : 'none';
  if (!on) return;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  el.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
}

function applyGfxTemplate(name) {
  const g = state.graphics;
  if (name === 'news') {
    g.lt.enabled = true; g.bn.enabled = false; g.ticker.enabled = true; g.live.enabled = true; g.clock.enabled = true; g.logo.enabled = true; g.loc.enabled = true;
    g.lt.title = 'KENYA LAUNCHES NEW ECONOMIC REFORMS';
    g.lt.subtitle = 'Government targets 6% GDP growth in 2026';
    g.ticker.text = 'NEWS · KENYA · BUSINESS · SPORTS · WEATHER · MARKETS · POLITICS';
    g.loc.text = 'NAIROBI';
  } else if (name === 'breaking') {
    g.lt.enabled = true; g.bn.enabled = true; g.ticker.enabled = true; g.live.enabled = true; g.logo.enabled = true; g.loc.enabled = true;
    g.bn.text = 'BREAKING: MAJOR DEVELOPMENT IN NAIROBI';
    g.lt.title = 'BREAKING NEWS';
    g.lt.subtitle = 'Live coverage — more details as they come in';
    g.ticker.text = 'BREAKING · DEVELOPING STORY · STAY WITH NEWS ROOM TV';
  } else if (name === 'sports') {
    g.lt.enabled = true; g.bn.enabled = false; g.ticker.enabled = true; g.live.enabled = true; g.logo.enabled = true; g.loc.enabled = true;
    g.lt.title = 'HAROON vs AFC — PREMIER LEAGUE';
    g.lt.subtitle = 'Full-time analysis with the sports desk';
    g.ticker.text = 'SPORTS · FOOTBALL · ATHLETICS · RESULTS · FIXTURES';
    g.loc.text = 'KASARANI';
  } else if (name === 'weather') {
    g.lt.enabled = true; g.bn.enabled = false; g.ticker.enabled = true; g.live.enabled = true; g.logo.enabled = true; g.loc.enabled = true;
    g.lt.title = 'NAIROBI WEATHER';
    g.lt.subtitle = 'Partly cloudy · High 26°C · Light showers evening';
    g.ticker.text = 'WEATHER · NAIROBI 26° · MOMBASA 30° · KISUMU 28° · ELDORET 22°';
    g.loc.text = 'KENYA';
  } else if (name === 'clear') {
    g.lt.enabled = false; g.bn.enabled = false; g.ticker.enabled = false; g.live.enabled = false; g.logo.enabled = false; g.loc.enabled = false;
  }
  Object.keys(g).forEach(updateToggleUI);
  syncGfxEditors();
  applyGraphicsToProgram();
  notifyBridgeState();
}

function updateProgramEngineUI() {
  document.getElementById('priority-badge').textContent = state.priority;
  const badge = document.getElementById('priority-badge');
  if (state.priority === 'EMERGENCY') badge.className = 'px-2 py-0.5 rounded bg-red-800 border border-red-500 text-red-100 font-bold';
  else if (state.priority === 'BREAKING') badge.className = 'px-2 py-0.5 rounded bg-orange-800 border border-orange-500 text-orange-100 font-bold';
  else if (state.priority === 'AD') badge.className = 'px-2 py-0.5 rounded bg-amber-800 border border-amber-500 text-amber-100 font-bold';
  else badge.className = 'px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300 font-medium';
}
function setPriority(level) { state.priority = level; updateProgramEngineUI(); notifyBridgeState(); }

function renderGuests() {
  const el = document.getElementById('guests-list');
  if (!el) return;
  el.innerHTML = state.guests.map(g => {
    if (g.status === 'connected') {
      return '<div class="p-1 rounded bg-[#131a28] border border-green-800/30"><div class="flex items-center gap-1.5"><div class="w-5 h-5 rounded-full bg-violet-800/50 flex items-center justify-center text-[9px] text-white">' + (g.name[0] || '?') + '</div><div class="min-w-0 flex-1"><div class="text-[10px] text-white truncate">' + g.name + '</div></div><button onclick="putGuestInPreview(\'' + g.id + '\')" class="text-[8px] px-1 rounded bg-blue-700/50 text-blue-300">Prev</button></div></div>';
    }
    if (g.status === 'lobby' || g.status === 'waiting') {
      return '<div class="p-1 rounded bg-amber-950/40 border border-amber-800/40"><div class="text-[10px] text-amber-200 truncate">' + g.name + '</div><div class="text-[8px] text-amber-500">' + g.status + '</div></div>';
    }
    return '<div class="p-1 rounded bg-[#131a28] opacity-50 text-[10px] text-slate-500">' + g.name + '</div>';
  }).join('');
  renderGuestsPage();
}

function putGuestInPreview(id) {
  const g = state.guests.find(x => x.id === id);
  if (!g || !g.sourceId) return;
  setLayout('host-guest');
  state.previewSlots = ['cam1', g.sourceId];
  renderPreview();
  renderSources();
}

function putGuestOnProgram(id) {
  const g = state.guests.find(x => x.id === id);
  if (!g || !g.sourceId) return;
  if (state.priority === 'EMERGENCY' || state.hold) return;
  putGuestInPreview(id);
  doTake();
}

function admitGuest(id) {
  const g = state.guests.find(x => x.id === id);
  if (!g || (g.status !== 'lobby' && g.status !== 'waiting' && g.status !== 'available')) return;
  const sourceId = g.sourceId || ('guest_' + g.id);
  g.sourceId = sourceId;
  g.status = 'connected';
  if (!state.sources.find(s => s.id === sourceId)) {
    state.sources.push({
      id: sourceId, name: g.name, type: 'guest', status: 'connected',
      res: '720p', role: g.role || 'Guest', color: '#5b21b6', icon: '👤', hasStream: false
    });
  } else {
    const s = state.sources.find(s => s.id === sourceId);
    s.name = g.name; s.status = 'connected'; s.role = g.role || 'Guest';
  }
  SOURCE_MAP[g.name] = sourceId;
  renderGuests();
  renderSources();
  audit('GUEST_ADMIT', g.name + ' → ' + sourceId);
}

function sendGuestToLobby(id) {
  const g = state.guests.find(x => x.id === id);
  if (!g) return;
  g.status = 'lobby';
  renderGuests();
}

function setGuestWaiting(id) {
  const g = state.guests.find(x => x.id === id);
  if (!g) return;
  g.status = 'waiting';
  renderGuests();
}

function removeGuest(id) {
  const g = state.guests.find(x => x.id === id);
  if (!g) return;
  // free slot
  g.status = 'available';
  g.name = 'Open slot';
  g.role = 'Guest';
  g.token = null;
  g.tier = 'free';
  g.paymentStatus = 'n/a';
  if (g.sourceId) {
    state.sources = state.sources.filter(s => s.id !== g.sourceId);
    g.sourceId = null;
  }
  renderGuests();
  renderSources();
}

function openInviteModal() {
  const m = document.getElementById('invite-modal');
  if (!m) return;
  m.classList.remove('hidden');
  const res = document.getElementById('invite-result');
  if (res) res.classList.add('hidden');
}
function closeInviteModal() {
  const m = document.getElementById('invite-modal');
  if (m) m.classList.add('hidden');
}
function createInvite() { sendInvite(); }

function sendInvite() {
  const name = (document.getElementById('invite-name') && document.getElementById('invite-name').value.trim()) || 'Guest';
  const role = (document.getElementById('invite-role') && document.getElementById('invite-role').value.trim()) || 'Guest';
  const tierEl = document.getElementById('invite-tier');
  const tier = (tierEl && tierEl.value) || 'free';
  let slot = state.guests.find(g => g.status === 'available');
  if (!slot) {
    slot = { id: 'g_' + Math.random().toString(36).slice(2, 7), name, role, status: 'lobby', sourceId: null, token: null, tier: 'free', paymentStatus: 'n/a' };
    state.guests.push(slot);
  } else {
    slot.name = name;
    slot.role = role;
    slot.status = 'lobby';
  }
  slot.tier = tier;
  slot.paymentStatus = tier === 'paid' ? 'pending' : 'n/a';
  slot.token = 'tok_' + Math.random().toString(36).slice(2, 8);
  const res = document.getElementById('invite-result');
  if (res) {
    const joinUrl = appPageUrl('guest.html', 'token=' + encodeURIComponent(slot.token));
    res.classList.remove('hidden');
    res.innerHTML = '<div class="text-green-400 text-[11px] font-semibold mb-1">Invite created</div>' +
      '<div class="text-[10px] text-slate-400">Token: <span class="font-mono text-slate-200">' + slot.token + '</span></div>' +
      '<div class="text-[10px] text-slate-400">Tier: <span class="text-slate-200">' + tier + '</span>' +
      (tier === 'paid' ? ' · payment <span class="text-amber-400">pending</span> (gateway not connected)' : '') + '</div>' +
      '<div class="text-[10px] text-cyan-300/90 break-all mt-1">Join link: <a class="underline" href="' + joinUrl + '" target="_blank" rel="noopener">' + joinUrl + '</a></div>' +
      '<div class="text-[9px] text-slate-500 mt-1">Share the link with the guest. Admit from Guests page to add them as a source.</div>';
  }
  audit('GUEST_INVITE', name + ' (' + tier + ')');
  renderGuests();
  if (typeof renderGuestsPage === 'function') renderGuestsPage();
}

function markGuestPaid(id) {
  const g = state.guests.find(x => x.id === id);
  if (!g) return;
  g.tier = 'paid';
  g.paymentStatus = 'paid';
  audit('GUEST_PAID', g.name + ' marked paid (manual)');
  if (typeof pushNotification === 'function') pushNotification('GUEST', g.name + ' marked paid', 'ok');
  renderGuests();
  renderGuestsPage();
}

function setGuestTier(id, tier) {
  const g = state.guests.find(x => x.id === id);
  if (!g) return;
  g.tier = tier;
  if (tier === 'free') g.paymentStatus = 'n/a';
  else if (g.paymentStatus !== 'paid') g.paymentStatus = 'pending';
  renderGuests();
  renderGuestsPage();
}


function readJoinLogs() {
  const out = [];
  try {
    const guests = JSON.parse(localStorage.getItem('bb_guest_join_log') || '[]');
    guests.forEach(j => out.push({
      kind: 'guest', token: j.token, name: j.name || 'Guest',
      at: j.joinedAt || j.at || 0,
      id: 'guest:' + (j.token || '') + ':' + (j.joinedAt || j.at || 0)
    }));
  } catch (e) {}
  try {
    const remotes = JSON.parse(localStorage.getItem('bb_remote_join_log') || '[]');
    remotes.forEach(j => out.push({
      kind: 'remote', token: j.token, name: j.label || j.name || 'Remote',
      at: j.at || 0,
      id: 'remote:' + (j.token || '') + ':' + (j.at || 0)
    }));
  } catch (e) {}
  out.sort((a, b) => (b.at || 0) - (a.at || 0));
  return out.slice(0, 30);
}

function refreshJoinInbox() {
  const list = document.getElementById('join-inbox-list');
  const countEl = document.getElementById('join-inbox-count');
  if (!list) return;
  const rows = readJoinLogs();
  state.joinInboxDismissed = state.joinInboxDismissed || {};
  const visible = rows.filter(r => !state.joinInboxDismissed[r.id]);
  if (countEl) countEl.textContent = visible.length + ' signal' + (visible.length === 1 ? '' : 's');
  if (!visible.length) {
    list.innerHTML = '<div class="text-slate-500 text-center py-3">No join signals yet — open guest.html / remote.html with a token on this origin</div>';
    return;
  }
  list.innerHTML = visible.map(r => {
    const time = r.at ? new Date(r.at).toLocaleTimeString() : '—';
    const kindCls = r.kind === 'remote' ? 'text-teal-300' : 'text-violet-300';
    const tok = encodeURIComponent(r.token || '');
    const nam = encodeURIComponent(r.name || '');
    const safeId = String(r.id).replace(/\\/g, '').replace(/'/g, '');
    return '<div class="flex flex-wrap items-center justify-between gap-1 px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a]/80">' +
      '<div class="min-w-0"><span class="font-semibold ' + kindCls + '">' + r.kind + '</span> ' +
      '<span class="text-white">' + r.name + '</span> ' +
      '<span class="font-mono text-[9px] text-slate-500">' + (r.token || '') + '</span> ' +
      '<span class="text-[9px] text-slate-600">' + time + '</span></div><div class="flex gap-0.5">' +
      (r.kind === 'guest'
        ? '<button type="button" onclick="acceptJoinGuest(\'' + tok + '\',\'' + nam + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-violet-800 text-white">Accept to lobby</button>'
        : '<button type="button" onclick="acceptJoinRemote(\'' + tok + '\',\'' + nam + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-teal-800 text-white">Add remote source</button>') +
      '<button type="button" onclick="dismissJoinSignal(\'' + safeId + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-500">Dismiss</button></div></div>';
  }).join('');
}

function dismissJoinSignal(id) {
  state.joinInboxDismissed = state.joinInboxDismissed || {};
  state.joinInboxDismissed[id] = true;
  refreshJoinInbox();
}

function clearJoinInbox() {
  try {
    localStorage.removeItem('bb_guest_join_log');
    localStorage.removeItem('bb_remote_join_log');
  } catch (e) {}
  state.joinInboxDismissed = {};
  refreshJoinInbox();
}

function acceptJoinGuest(tokenEnc, nameEnc) {
  const token = decodeURIComponent(tokenEnc || '');
  const name = decodeURIComponent(nameEnc || '') || 'Guest';
  let g = state.guests.find(x => x.token === token);
  if (!g) {
    g = state.guests.find(x => x.status === 'available');
    if (!g) {
      g = { id: 'g_' + Math.random().toString(36).slice(2, 7), name, role: 'Guest', status: 'lobby', sourceId: null, token, tier: 'free', paymentStatus: 'n/a' };
      state.guests.push(g);
    } else {
      g.name = name; g.token = token; g.status = 'lobby'; g.role = g.role || 'Guest';
    }
  } else {
    g.name = name || g.name;
    g.status = 'lobby';
  }
  audit('GUEST_JOIN_ACCEPT', name + ' token ' + token);
  if (typeof pushNotification === 'function') pushNotification('GUEST', name + ' accepted from join inbox', 'ok');
  renderGuests();
  renderGuestsPage();
  refreshJoinInbox();
}

function acceptJoinRemote(tokenEnc, nameEnc) {
  const token = decodeURIComponent(tokenEnc || '');
  const name = decodeURIComponent(nameEnc || '') || 'Remote';
  let src = state.sources.find(s => s.shareToken === token);
  if (!src) {
    const id = 'remote_' + Math.random().toString(36).slice(2, 7);
    src = {
      id, name: name + ' (field)', type: 'remote', status: 'standby', res: '—', role: 'Field',
      color: '#0f766e', icon: '📡', hasStream: false, shareToken: token,
      shareUrl: typeof appPageUrl === 'function' ? appPageUrl('remote.html', 'token=' + encodeURIComponent(token)) : ''
    };
    state.sources.push(src);
    SOURCE_MAP[src.name] = id;
  } else {
    src.name = name + ' (field)';
    src.status = 'standby';
  }
  audit('REMOTE_JOIN_ACCEPT', name + ' token ' + token);
  if (typeof pushNotification === 'function') pushNotification('REMOTE', name + ' added as source', 'ok');
  if (typeof renderSources === 'function') renderSources();
  if (typeof renderSourcesPage === 'function') renderSourcesPage();
  refreshJoinInbox();
}

function renderGuestsPage() {
  const body = document.getElementById('guests-page-body');
  if (!body) return;
  const statusColor = {
    connected: 'text-green-400',
    lobby: 'text-amber-400',
    waiting: 'text-blue-300',
    available: 'text-slate-500'
  };
  body.innerHTML = state.guests.map(g => {
    const tier = g.tier || 'free';
    const pay = g.paymentStatus || 'n/a';
    const tierLabel = tier === 'paid'
      ? ('<span class="text-amber-300">paid</span> <span class="text-[9px] text-slate-500">(' + pay + ')</span>')
      : '<span class="text-slate-400">free</span>';
    return '<tr class="border-t border-[#1e2a3a]/60 hover:bg-[#131a28]">' +
      '<td class="px-3 py-2 text-white font-medium">' + g.name + '</td>' +
      '<td class="px-2 py-2 text-slate-400">' + (g.role || '—') + '</td>' +
      '<td class="px-2 py-2">' + tierLabel + '</td>' +
      '<td class="px-2 py-2 ' + (statusColor[g.status] || 'text-slate-400') + '">' + g.status + '</td>' +
      '<td class="px-2 py-2 font-mono text-[10px] text-slate-500">' + (g.sourceId || '—') + '</td>' +
      '<td class="px-2 py-2"><div class="flex flex-wrap gap-0.5">' +
        (g.status === 'lobby' || g.status === 'waiting'
          ? '<button onclick="admitGuest(\'' + g.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-800 text-white">Admit</button>' : '') +
        (g.tier === 'paid' && g.paymentStatus === 'pending'
          ? '<button onclick="markGuestPaid(\'' + g.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-amber-800 text-amber-100">Mark paid</button>' : '') +
        (g.status === 'connected'
          ? '<button onclick="putGuestInPreview(\'' + g.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-800 text-white">Preview</button>' +
            '<button onclick="putGuestOnProgram(\'' + g.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-700 text-white">TAKE</button>' +
            '<button onclick="sendGuestToLobby(\'' + g.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Lobby</button>'
          : '') +
        (g.status === 'available'
          ? '<button onclick="openInviteModal()" class="text-[9px] px-1.5 py-0.5 rounded bg-violet-800 text-white">Invite</button>'
          : '') +
        (g.status !== 'available'
          ? '<button onclick="removeGuest(\'' + g.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-red-950 text-red-300">Remove</button>'
          : '') +
      '</div></td></tr>';
  }).join('');

  const connected = state.guests.filter(g => g.status === 'connected').length;
  const lobby = state.guests.filter(g => g.status === 'lobby').length;
  const waiting = state.guests.filter(g => g.status === 'waiting').length;
  const slots = state.guests.filter(g => g.status === 'available').length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('gp-stat-connected', connected);
  set('gp-stat-lobby', lobby);
  set('gp-stat-waiting', waiting);
  set('gp-stat-slots', slots);
  const paidN = state.guests.filter(g => g.tier === 'paid' && g.status !== 'available').length;
  const freeN = state.guests.filter(g => (g.tier || 'free') === 'free' && g.status !== 'available').length;
  set('gp-stat-tiers', paidN + ' / ' + freeN);
  if (typeof refreshJoinInbox === 'function') refreshJoinInbox();

  const q = document.getElementById('gp-quick');
  if (q) {
    const conn = state.guests.filter(g => g.status === 'connected');
    q.innerHTML = conn.length
      ? conn.map(g =>
          '<button onclick="putGuestOnProgram(\'' + g.id + '\')" class="w-full text-left px-2 py-1.5 rounded bg-[#131a28] hover:bg-[#1a2234] text-[11px] text-white">' +
          g.name + ' <span class="text-green-500 text-[9px]">TAKE</span></button>'
        ).join('')
      : '<div class="text-[10px] text-slate-500">No connected guests</div>';
  }
}

function renderNav() {
  const el = document.getElementById('nav');
  if (!el) return;
  el.innerHTML = navItems.map(n => {
    const active = n.id === state.currentView || (state.currentView === 'studio' && n.id === 'studio' && n.active);
    return '<button type="button" data-nav="' + n.id + '" class="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] ' + (active || n.id === state.currentView ? 'nav-active' : 'text-slate-400 hover:bg-[#131a28] hover:text-slate-200 border-l-2 border-transparent') + '"><span class="w-4 text-center shrink-0">' + n.icon + '</span><span class="truncate">' + n.label + '</span></button>';
  }).join('');
  el.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-nav')));
  });
}

function navigateTo(id) {
  const implemented = { studio: true, destinations: true, recordings: true, home: true, users: true, analytics: true, settings: true, guests: true, news: true, sources: true, ads: true, graphics: true, audio: true };
  const studio = document.getElementById('view-studio');
  const dest = document.getElementById('view-destinations');
  const recs = document.getElementById('view-recordings');
  const home = document.getElementById('view-home');
  const users = document.getElementById('view-users');
  const analytics = document.getElementById('view-analytics');
  const settings = document.getElementById('view-settings');
  const guests = document.getElementById('view-guests');
  const news = document.getElementById('view-news');
  const sources = document.getElementById('view-sources');
  const ads = document.getElementById('view-ads');
  const graphics = document.getElementById('view-graphics');
  const audio = document.getElementById('view-audio');

  if (!implemented[id]) {
    id = 'studio';
  }

  state.currentView = id;
  navItems.forEach(n => { n.active = n.id === id; });

  if (studio) studio.classList.toggle('hidden', id !== 'studio');
  if (dest) dest.classList.toggle('hidden', id !== 'destinations');
  if (recs) recs.classList.toggle('hidden', id !== 'recordings');
  if (home) home.classList.toggle('hidden', id !== 'home');
  if (users) users.classList.toggle('hidden', id !== 'users');
  if (analytics) analytics.classList.toggle('hidden', id !== 'analytics');
  if (settings) settings.classList.toggle('hidden', id !== 'settings');
  if (guests) guests.classList.toggle('hidden', id !== 'guests');
  if (news) news.classList.toggle('hidden', id !== 'news');
  if (sources) sources.classList.toggle('hidden', id !== 'sources');
  if (ads) ads.classList.toggle('hidden', id !== 'ads');
  if (graphics) graphics.classList.toggle('hidden', id !== 'graphics');
  if (audio) audio.classList.toggle('hidden', id !== 'audio');

  renderNav();
  if (id === 'destinations') {
    loadDestLocalIntoForm();
    const st = bridge && bridge.getStatus && bridge.getStatus();
    if (st) applyBridgeStatusToUI(st);
  }
  if (id === 'recordings') {
    renderRecordingsList();
    updateRecordingUI();
  }
  if (id === 'home') {
    renderHomeDashboard();
  }
  if (id === 'users') {
    renderUsersPage();
  }
  if (id === 'analytics') {
    renderAnalyticsPage();
  }
  if (id === 'settings') {
    loadSettingsForm();
    renderAuditLog();
  }
  if (id === 'guests') {
    renderGuestsPage();
  }
  if (id === 'news') {
    renderNewsDirectorPage();
  }
  if (id === 'sources') {
    renderSourcesPage();
    bindSourcePageTabs();
  }
  if (id === 'ads') {
    renderAdsPage();
    bindAdsPageFilters();
  }
  if (id === 'graphics') {
    renderGraphicsPage();
  }
  if (id === 'audio') {
    renderAudioPage();
  }
}

function renderAudioPage() {
  if (!state.audio) return;
  const master = state.audio.master;
  const mf = document.getElementById('ap-fader-master');
  if (mf && document.activeElement !== mf) mf.value = master.level;
  const mv = document.getElementById('ap-val-master');
  if (mv) mv.textContent = master.level;
  const mm = document.getElementById('ap-mute-master');
  if (mm) {
    mm.textContent = master.mute ? 'MUTED' : 'MUTE';
    mm.className = 'text-[10px] px-2 py-0.5 rounded font-semibold ' + (master.mute ? 'bg-red-700 text-white' : 'bg-[#1e2a3a] text-slate-300');
  }
  const meter = document.getElementById('ap-meter-master');
  if (meter) {
    if (master.mute) meter.style.width = '2%';
    else {
      const avg = state.audio.channels.reduce((s, c) => s + (typeof effectiveAudioMeter === 'function' ? effectiveAudioMeter(c) : c.level), 0) / Math.max(1, state.audio.channels.length);
      meter.style.width = Math.round(avg * (master.level / 100)) + '%';
    }
  }

  const box = document.getElementById('audio-page-channels');
  if (box) {
    const anySolo = state.audio.channels.some(c => c.solo);
    box.innerHTML = state.audio.channels.map(ch => {
      const dim = anySolo && !ch.solo;
      return '<div class="p-2 rounded bg-[#131a28] border border-[#1e2a3a] ' + (dim ? 'opacity-40' : '') + '">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<span class="text-[11px] text-white font-medium">' + ch.name + '</span>' +
          '<div class="flex gap-0.5">' +
            '<button onclick="toggleAudioSolo(\'' + ch.id + '\'); renderAudioPage();" class="text-[8px] px-1.5 py-0.5 rounded ' + (ch.solo ? 'bg-amber-600 text-white' : 'bg-[#1e2a3a] text-slate-400') + '">S</button>' +
            '<button onclick="toggleAudioMute(\'' + ch.id + '\'); renderAudioPage();" class="text-[8px] px-1.5 py-0.5 rounded ' + (ch.mute ? 'bg-red-700 text-white' : 'bg-[#1e2a3a] text-slate-400') + '">M</button>' +
          '</div></div>' +
        '<input type="range" min="0" max="100" value="' + ch.level + '" class="w-full h-1.5 accent-emerald-500" oninput="setAudioLevel(\'' + ch.id + '\', this.value); document.getElementById(\'' + 'apv-' + ch.id + '\').textContent=this.value;" />' +
        '<div class="flex justify-between text-[9px] text-slate-500 mt-0.5"><span id="apv-' + ch.id + '">' + ch.level + '</span>' +
        '<div class="w-16 h-1.5 rounded bg-[#0a0e17] overflow-hidden"><div class="h-full bg-emerald-500" style="width:' + (typeof effectiveAudioMeter === 'function' ? effectiveAudioMeter(ch) : ch.level) + '%"></div></div></div></div>';
    }).join('');
  }

  const sum = document.getElementById('audio-page-summary');
  if (sum) {
    const anySolo = state.audio.channels.some(c => c.solo);
    sum.innerHTML = state.audio.channels.map(ch => {
      let stateLabel = 'open';
      if (master.mute || ch.mute) stateLabel = 'muted';
      else if (anySolo && !ch.solo) stateLabel = 'dimmed';
      else if (ch.solo) stateLabel = 'solo';
      return '<div class="flex justify-between px-2 py-1 rounded bg-[#131a28]"><span class="text-slate-300">' + ch.name + '</span>' +
        '<span class="text-slate-400">' + ch.level + '% · ' + stateLabel + '</span></div>';
    }).join('');
  }

  if (typeof renderAudioMixer === 'function') renderAudioMixer();
}


function renderGraphicsPage() {
  const g = state.graphics || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = val != null ? val : '';
  };
  setVal('gp-lt-title', g.lt && g.lt.title);
  setVal('gp-lt-sub', g.lt && g.lt.subtitle);
  setVal('gp-bn', g.bn && g.bn.text);
  setVal('gp-ticker', g.ticker && g.ticker.text);
  setVal('gp-loc', g.loc && g.loc.text);
  setVal('gp-logo', g.logo && g.logo.text);

  const mark = (key, btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn || !g[key]) return;
    const on = !!g[key].enabled;
    btn.textContent = on ? 'ON' : 'OFF';
    btn.className = 'text-[9px] px-2 py-0.5 rounded border font-semibold ' + (
      on ? 'border-green-600 bg-green-900/40 text-green-300' : 'border-[#2a3a4f] text-slate-400'
    );
  };
  mark('lt', 'gp-tog-lt');
  mark('bn', 'gp-tog-bn');
  mark('ticker', 'gp-tog-ticker');
  mark('loc', 'gp-tog-loc');
  mark('logo', 'gp-tog-logo');
  mark('live', 'gp-tog-live');
  mark('clock', 'gp-tog-clock');

  const layers = document.getElementById('gp-layers');
  if (layers) {
    const items = [
      ['Lower third', 'lt'],
      ['Breaking', 'bn'],
      ['Ticker', 'ticker'],
      ['LIVE bug', 'live'],
      ['Clock', 'clock'],
      ['Logo', 'logo'],
      ['Location', 'loc']
    ];
    layers.innerHTML = items.map(([label, key]) => {
      const on = g[key] && g[key].enabled;
      return '<div class="flex items-center justify-between px-2 py-1.5 rounded bg-[#131a28]">' +
        '<span class="text-slate-300">' + label + '</span>' +
        '<span class="' + (on ? 'text-green-400' : 'text-slate-500') + ' font-semibold">' + (on ? 'ON PROGRAM' : 'off') + '</span></div>';
    }).join('');
  }
  if (typeof syncGfxEditors === 'function') syncGfxEditors();
}


function bindAdsPageFilters() {
  document.querySelectorAll('.ap-filter').forEach(btn => {
    btn.onclick = () => {
      state.adFilter = btn.getAttribute('data-apfilter') || 'all';
      document.querySelectorAll('.ap-filter').forEach(b => {
        const on = b === btn;
        b.className = on
          ? 'ap-filter tab-active text-[9px] px-1.5 py-0.5 rounded border border-amber-600 text-amber-200'
          : 'ap-filter text-[9px] px-1.5 py-0.5 rounded border border-[#1e2a3a] bg-[#131a28] text-slate-400';
      });
      renderAdsPage();
    };
  });
}

function renderAdsPage() {
  const filter = state.adFilter || 'all';
  let rows = (state.ads || []).slice();
  if (filter === 'eligible') rows = rows.filter(a => typeof isAdEligible === 'function' && isAdEligible(a));
  if (filter === 'pending') rows = rows.filter(a => a.status === 'pending');

  const body = document.getElementById('ads-page-body');
  if (body) {
    body.innerHTML = rows.map(a => {
      const eligible = typeof isAdEligible === 'function' && isAdEligible(a);
      const reason = typeof adEligibilityReason === 'function' ? adEligibilityReason(a) : a.status;
      return '<tr class="border-t border-[#1e2a3a]/60 hover:bg-[#131a28]">' +
        '<td class="px-3 py-2 text-white font-medium">' + a.title + '<div class="text-[9px] text-slate-500">' + (a.advertiser || '') + ' · ' + a.dur + '</div></td>' +
        '<td class="px-2 py-2 text-slate-400">' + (a.campaign || '—') + ' · P' + (a.priority || 2) + '</td>' +
        '<td class="px-2 py-2 text-[10px] text-slate-500">' + (a.startDate || '?') + ' → ' + (a.endDate || '?') + '</td>' +
        '<td class="px-2 py-2 text-[10px] text-slate-500">' + (a.dayStart || '') + '–' + (a.dayEnd || '') + '</td>' +
        '<td class="px-2 py-2 text-[10px] text-slate-400">' + (a.playsToday || 0) + '/' + (a.maxPerDay || '∞') + ' d · ' + (a.plays || 0) + ' tot</td>' +
        '<td class="px-2 py-2 ' + (eligible ? 'text-green-400' : 'text-amber-500') + '">' + reason + '</td>' +
        '<td class="px-2 py-2"><div class="flex flex-wrap gap-0.5">' +
          (a.status === 'pending'
            ? '<button onclick="approveAd(\'' + a.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-800 text-white">Approve</button>'
            : '<button onclick="playAd(\'' + a.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-amber-700 text-white">Play</button>') +
          '<button onclick="queueAdInRundown(\'' + a.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Queue</button>' +
          '<button onclick="openAdModal(\'' + a.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-400">Edit</button>' +
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">No ads in filter</td></tr>';
  }

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('ap-stat-total', (state.ads || []).length);
  set('ap-stat-eligible', typeof getEligibleAds === 'function' ? getEligibleAds().length : 0);
  set('ap-stat-plays', (state.ads || []).reduce((s, a) => s + (a.plays || 0), 0));
  set('ap-stat-onair', state.activeAd ? state.activeAd.title : '—');

  const now = document.getElementById('ap-now');
  if (now) {
    if (state.activeAd) {
      now.classList.remove('hidden');
      set('ap-now-title', state.activeAd.title);
      set('ap-now-count', formatDur(state.adRemaining || 0));
    } else {
      now.classList.add('hidden');
    }
  }
}


function bindSourcePageTabs() {
  document.querySelectorAll('.src-ptab').forEach(btn => {
    btn.onclick = () => {
      state.sourceFilter = btn.getAttribute('data-stab') || 'all';
      document.querySelectorAll('.src-ptab').forEach(b => {
        const on = b === btn;
        b.className = on
          ? 'src-ptab tab-active text-[9px] px-1.5 py-0.5 rounded border border-blue-500'
          : 'src-ptab text-[9px] px-1.5 py-0.5 rounded border border-[#1e2a3a] bg-[#131a28] text-slate-400';
      });
      renderSourcesPage();
      // sync studio tabs if present
      document.querySelectorAll('.source-tab').forEach(b => {
        const on = b.dataset.tab === state.sourceFilter;
        b.className = on
          ? 'source-tab tab-active text-[9px] px-1.5 py-0.5 rounded border border-blue-500'
          : 'source-tab text-[9px] px-1.5 py-0.5 rounded border border-[#1e2a3a] bg-[#131a28] text-slate-400';
      });
      if (typeof renderSources === 'function') renderSources();
    };
  });
}

function parseYouTubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const parts = u.pathname.split('/');
    const embed = parts.indexOf('embed');
    if (embed >= 0 && parts[embed + 1]) return parts[embed + 1];
    const shorts = parts.indexOf('shorts');
    if (shorts >= 0 && parts[shorts + 1]) return parts[shorts + 1];
  } catch (e) {}
  return null;
}

function sourcePreviewHTML(s) {
  const onProg = (state.programSlots || []).includes(s.id);
  const onPrev = (state.previewSlots || []).includes(s.id);
  let media = '';
  if (s.type === 'youtube' && s.youtubeId) {
    media = '<iframe class="w-full h-full" src="https://www.youtube.com/embed/' + s.youtubeId + '?autoplay=0&mute=1&controls=1" title="' + (s.name || 'YouTube') + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
  } else if (s.type === 'media' && s.mediaUrl) {
    media = '<video class="w-full h-full object-contain bg-black" src="' + s.mediaUrl + '" muted controls playsinline></video>';
  } else if (s.type === 'image' && s.imageUrl) {
    media = '<img class="w-full h-full object-contain bg-black" src="' + s.imageUrl + '" alt="" />';
  } else if (s.type === 'camera' && s.id === 'cam1' && state.media && state.media.localStream) {
    media = '<video class="w-full h-full object-cover bg-black" id="src-prev-cam1" autoplay muted playsinline></video>';
  } else if (s.type === 'screen' && state.media && state.media.screenStream) {
    media = '<video class="w-full h-full object-contain bg-black" id="src-prev-screen" autoplay muted playsinline></video>';
  } else {
    const label = s.type === 'remote' ? 'Remote link ready' :
      s.type === 'guest' ? 'Guest source' :
      s.type === 'screen' ? 'Start screen share' :
      s.type === 'youtube' ? 'Paste YouTube URL' :
      s.type === 'media' ? 'Upload video' : s.type === 'image' ? 'Upload image' : (s.status || s.type);
    media = '<div class="w-full h-full flex flex-col items-center justify-center gap-1" style="background:' + (s.color || '#1e293b') + '33">' +
      '<span class="text-2xl">' + (s.icon || '•') + '</span>' +
      '<span class="text-[10px] text-slate-400">' + label + '</span></div>';
  }
  return '<div class="rounded-lg border overflow-hidden bg-black ' + (onProg ? 'border-red-500' : onPrev ? 'border-green-500' : 'border-[#1e2a3a]') + '">' +
    '<div class="aspect-video relative">' + media +
      (onProg ? '<span class="absolute top-1 left-1 text-[8px] px-1 rounded bg-red-600 text-white font-bold">PGM</span>' : '') +
      (onPrev ? '<span class="absolute top-1 right-1 text-[8px] px-1 rounded bg-green-700 text-white font-bold">PVW</span>' : '') +
    '</div>' +
    '<div class="px-2 py-1.5 bg-[#0f1520] flex items-center justify-between gap-1">' +
      '<div class="min-w-0"><div class="text-[11px] text-white font-medium truncate">' + s.name + '</div>' +
      '<div class="text-[9px] text-slate-500">' + s.type + ' · ' + (s.status || '') + '</div></div>' +
      '<div class="flex gap-0.5 shrink-0">' +
        '<button type="button" onclick="selectSource(\'' + s.id + '\'); renderSourcesPage();" class="text-[8px] px-1.5 py-0.5 rounded bg-blue-800 text-white">PVW</button>' +
        '<button type="button" onclick="takeSourceDirect(\'' + s.id + '\')" class="text-[8px] px-1.5 py-0.5 rounded bg-green-800 text-white">TAKE</button>' +
      '</div></div></div>';
}

function renderSourcesPage() {
  const filter = state.sourceFilter || 'all';
  const list = filter === 'all' ? state.sources : state.sources.filter(s => s.type === filter);
  const onProg = new Set(state.programSlots || []);
  const onPrev = new Set(state.previewSlots || []);

  const grid = document.getElementById('sources-preview-grid');
  if (grid) {
    grid.innerHTML = list.map(sourcePreviewHTML).join('') ||
      '<div class="col-span-full text-center text-slate-500 text-[11px] py-6">No sources — use + Add sources</div>';
    // Attach local camera preview if present
    const v = document.getElementById('src-prev-cam1');
    if (v && state.media && state.media.localStream) {
      try { v.srcObject = state.media.localStream; } catch (e) {}
    }
    const sv = document.getElementById('src-prev-screen');
    if (sv && state.media && state.media.screenStream) {
      try { sv.srcObject = state.media.screenStream; } catch (e) {}
    }
  }

  const body = document.getElementById('sources-page-body');
  if (body) {
    body.innerHTML = list.map(s => {
      const bus = onProg.has(s.id) ? 'PROGRAM' : (onPrev.has(s.id) ? 'PREVIEW' : '—');
      const busCls = onProg.has(s.id) ? 'text-red-400 font-semibold' : (onPrev.has(s.id) ? 'text-green-400' : 'text-slate-600');
      const extra = s.youtubeId ? 'YT:' + s.youtubeId : (s.shareToken ? s.shareToken : (s.mediaUrl ? 'file' : ''));
      return '<tr class="border-t border-[#1e2a3a]/60 hover:bg-[#131a28]">' +
        '<td class="px-3 py-2"><div class="flex items-center gap-2">' +
          '<span class="w-6 h-6 rounded flex items-center justify-center text-sm" style="background:' + (s.color || '#333') + '55">' + (s.icon || '•') + '</span>' +
          '<div><span class="text-white font-medium">' + s.name + '</span>' +
          (extra ? '<div class="text-[9px] text-slate-600 font-mono truncate max-w-[160px]">' + extra + '</div>' : '') +
          '</div></div></td>' +
        '<td class="px-2 py-2 text-slate-400">' + s.type + '</td>' +
        '<td class="px-2 py-2 text-slate-400">' + (s.role || '—') + '</td>' +
        '<td class="px-2 py-2 text-slate-500">' + (s.res || '—') + '</td>' +
        '<td class="px-2 py-2 text-slate-400">' + (s.status || '—') + '</td>' +
        '<td class="px-2 py-2 ' + busCls + '">' + bus + '</td>' +
        '<td class="px-2 py-2"><div class="flex gap-0.5">' +
          '<button onclick="selectSource(\'' + s.id + '\'); renderSourcesPage();" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-800 text-white">Preview</button>' +
          '<button onclick="takeSourceDirect(\'' + s.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-800 text-white">TAKE</button>' +
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">No sources in filter</td></tr>';
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('src-stat-total', state.sources.length);
  set('src-stat-program', onProg.size);
  set('src-stat-preview', onPrev.size);
  set('src-stat-live', state.sources.filter(s => s.status === 'live' || s.status === 'connected' || s.hasStream || s.youtubeId || s.mediaUrl).length);

  const busHtml = (slots) => (slots || []).map(id => {
    const s = getSource(id);
    return '<div class="px-2 py-1 rounded bg-[#131a28]">' + (s ? s.name : id) + ' <span class="text-slate-600 text-[9px]">' + id + '</span></div>';
  }).join('') || '<div class="text-slate-500">Empty</div>';
  const pb = document.getElementById('src-program-bus');
  const pr = document.getElementById('src-preview-bus');
  if (pb) pb.innerHTML = busHtml(state.programSlots);
  if (pr) pr.innerHTML = busHtml(state.previewSlots);
}

function takeSourceDirect(id) {
  if (state.priority === 'EMERGENCY' || state.hold) return;
  selectSource(id);
  doTake();
  renderSourcesPage();
}

let addSourceType = 'youtube';

function openAddSourceModal() {
  addSourceType = 'youtube';
  document.querySelectorAll('.astype-tab').forEach(b => {
    const on = b.getAttribute('data-astype') === 'youtube';
    b.className = on
      ? 'astype-tab tab-active text-[9px] px-2 py-1 rounded border border-blue-500 text-blue-200'
      : 'astype-tab text-[9px] px-2 py-1 rounded border border-[#2a3a4f] text-slate-400';
  });
  ['youtube', 'media', 'image', 'remote', 'guest', 'screen'].forEach(k => {
    const p = document.getElementById('add-src-panel-' + k);
    if (p) p.classList.toggle('hidden', k !== 'youtube');
  });
  const msg = document.getElementById('add-src-msg');
  if (msg) msg.textContent = '';
  const link = document.getElementById('as-remote-link');
  if (link) { link.classList.add('hidden'); link.textContent = ''; }
  const sub = document.getElementById('as-submit');
  if (sub) sub.classList.toggle('hidden', false);
  document.getElementById('add-source-modal').classList.remove('hidden');
  document.querySelectorAll('.astype-tab').forEach(btn => {
    btn.onclick = () => {
      addSourceType = btn.getAttribute('data-astype') || 'youtube';
      document.querySelectorAll('.astype-tab').forEach(b => {
        const on = b === btn;
        b.className = on
          ? 'astype-tab tab-active text-[9px] px-2 py-1 rounded border border-blue-500 text-blue-200'
          : 'astype-tab text-[9px] px-2 py-1 rounded border border-[#2a3a4f] text-slate-400';
      });
      ['youtube', 'media', 'image', 'remote', 'guest', 'screen'].forEach(k => {
        const p = document.getElementById('add-src-panel-' + k);
        if (p) p.classList.toggle('hidden', k !== addSourceType);
      });
      if (sub) sub.classList.toggle('hidden', addSourceType === 'guest' || addSourceType === 'screen');
    };
  });
}

function closeAddSourceModal() {
  const m = document.getElementById('add-source-modal');
  if (m) m.classList.add('hidden');
}

function submitAddSource() {
  const msg = document.getElementById('add-src-msg');
  const setMsg = (text, ok) => {
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'text-[10px] min-h-[16px] mt-2 ' + (ok ? 'text-green-400' : 'text-red-400');
  };
  if (addSourceType === 'guest') {
    closeAddSourceModal();
    openInviteModal();
    return;
  }
  if (addSourceType === 'screen') {
    closeAddSourceModal();
    startScreenShare();
    return;
  }
  if (addSourceType === 'youtube') {
    const name = (document.getElementById('as-yt-name').value || '').trim() || 'YouTube source';
    const url = (document.getElementById('as-yt-url').value || '').trim();
    const yid = parseYouTubeId(url);
    if (!yid) {
      setMsg('Enter a valid YouTube URL or 11-character video ID.', false);
      return;
    }
    const id = 'yt_' + Math.random().toString(36).slice(2, 7);
    state.sources.push({
      id, name, type: 'youtube', status: 'live', res: '1080p', role: 'External',
      color: '#991b1b', icon: '▶', hasStream: true, youtubeId: yid, url: url
    });
    SOURCE_MAP[name] = id;
    audit('SOURCE_ADD', 'YouTube ' + name + ' (' + yid + ')');
    setMsg('YouTube source added.', true);
    closeAddSourceModal();
    renderSources();
    renderSourcesPage();
    return;
  }
  if (addSourceType === 'media') {
    const name = (document.getElementById('as-media-name').value || '').trim() || 'Uploaded media';
    const fileInput = document.getElementById('as-media-file');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      setMsg('Choose a video file.', false);
      return;
    }
    const url = URL.createObjectURL(file);
    const id = 'media_' + Math.random().toString(36).slice(2, 7);
    state.sources.push({
      id, name, type: 'media', status: 'ready', res: 'local', role: 'Package',
      color: '#854d0e', icon: '🎬', hasStream: true, mediaUrl: url
    });
    SOURCE_MAP[name] = id;
    audit('SOURCE_ADD', 'Media ' + name);
    if (typeof pushNotification === 'function') pushNotification('MEDIA', name + ' ready — TAKE to Program', 'ok');
    closeAddSourceModal();
    renderSources();
    renderSourcesPage();
    return;
  }
  if (addSourceType === 'image') {
    const name = (document.getElementById('as-image-name').value || '').trim() || 'Still image';
    const fileInput = document.getElementById('as-image-file');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      setMsg('Choose an image file.', false);
      return;
    }
    const url = URL.createObjectURL(file);
    const id = 'img_' + Math.random().toString(36).slice(2, 7);
    state.sources.push({
      id, name, type: 'image', status: 'ready', res: 'still', role: 'Image',
      color: '#4c1d95', icon: '🖼', hasStream: true, imageUrl: url
    });
    SOURCE_MAP[name] = id;
    audit('SOURCE_ADD', 'Image ' + name);
    if (typeof pushNotification === 'function') pushNotification('IMAGE', name + ' ready — TAKE to Program', 'ok');
    closeAddSourceModal();
    renderSources();
    renderSourcesPage();
    return;
  }
  if (addSourceType === 'remote') {
    const name = (document.getElementById('as-remote-name').value || '').trim() || 'Remote camera';
    const token = 'tok_rm_' + Math.random().toString(36).slice(2, 10);
    const id = 'remote_' + Math.random().toString(36).slice(2, 7);
    const shareUrl = appPageUrl('remote.html', 'token=' + encodeURIComponent(token));
    state.sources.push({
      id, name, type: 'remote', status: 'standby', res: '—', role: 'Field',
      color: '#0f766e', icon: '📡', hasStream: false, shareToken: token, shareUrl: shareUrl
    });
    SOURCE_MAP[name] = id;
    const linkEl = document.getElementById('as-remote-link');
    if (linkEl) {
      const warn = isFileOrigin() && !(state.settings && state.settings.publicBaseUrl);
      linkEl.innerHTML =
        '<div class="text-[10px] text-cyan-300 break-all">' + shareUrl + '</div>' +
        '<div class="text-[9px] text-slate-500 mt-1">Token: <span class="font-mono text-slate-300">' + token + '</span></div>' +
        (warn
          ? '<div class="text-[9px] text-amber-400 mt-1">file:// detected — set Settings → Public site URL or open the app via http:// so this link is shareable.</div>'
          : '<div class="text-[9px] text-slate-500 mt-1">Open on the field phone/laptop (same Wi‑Fi or public HTTPS).</div>') +
        '<div class="text-[9px] text-amber-300/90 mt-1">Video path: slot is in Source Engine only. Live WebRTC ingest into Program is not connected yet.</div>';
      linkEl.classList.remove('hidden');
    }
    audit('SOURCE_ADD', 'Remote ' + name + ' token ' + token);
    setMsg('Remote source slot created. Link/token ready — live remote video not connected yet.', true);
    renderSources();
    renderSourcesPage();
    return;
  }
}


function renderNewsDirectorPage() {
  const playing = getPlayingItem();
  const next = state.rundown.find(r => r.status === 'Upcoming');
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('nd-now', playing ? playing.title : '—');
  set('nd-next', next ? next.title : '—');
  set('nd-clock', formatDur(state.itemRemaining || 0));
  const done = state.rundown.filter(r => r.status === 'Completed' || r.status === 'Skipped').length;
  const total = state.rundown.length || 1;
  set('nd-progress', Math.round((done / total) * 100) + '%');
  let autoLabel = 'Idle';
  if (state.emergency) autoLabel = 'Blocked (emergency)';
  else if (state.breaking) autoLabel = 'Held (breaking)';
  else if (state.itemPaused) autoLabel = 'Clock paused';
  else if (state.autoDirector) autoLabel = 'Timed Auto ON';
  set('nd-auto-status', autoLabel);
  const auto = document.getElementById('nd-auto');
  if (auto) auto.checked = !!state.autoDirector;
  const detail = document.getElementById('nd-auto-detail');
  if (detail) detail.textContent = autoLabel;
  const queue = document.getElementById('nd-auto-queue');
  if (queue) {
    const upcoming = state.rundown.filter(r => r.status === 'Upcoming').slice(0, 3).map(r => r.title);
    queue.textContent = upcoming.length ? upcoming.join(' → ') : '—';
  }
  set('nd-notes', playing && playing.notes ? playing.notes : (next && next.notes ? 'Next: ' + next.notes : 'No operator notes'));

  const body = document.getElementById('nd-rundown-body');
  if (!body) return;
  const colors = { Completed: 'text-slate-500', Playing: 'text-green-400', Paused: 'text-amber-400', Upcoming: 'text-blue-400', Skipped: 'text-slate-600' };
  body.innerHTML = state.rundown.map((r, idx) =>
    '<tr class="border-t border-[#1e2a3a]/50 ' + (r.status === 'Playing' ? 'row-playing' : '') + ' hover:bg-[#131a28]">' +
    '<td class="px-3 py-1.5 text-slate-500">' + r.n + '</td>' +
    '<td class="px-2 py-1.5 text-slate-400">' + r.type + '</td>' +
    '<td class="px-2 py-1.5 text-white font-medium">' + r.title + '</td>' +
    '<td class="px-2 py-1.5 font-mono text-slate-400">' + r.dur + '</td>' +
    '<td class="px-2 py-1.5 text-slate-400">' + (r.source || '—') + '</td>' +
    '<td class="px-2 py-1.5 ' + (colors[r.status] || '') + '">' + r.status + '</td>' +
    '<td class="px-2 py-1.5 text-slate-500 max-w-[120px] truncate">' + (r.notes || '') + '</td>' +
    '<td class="px-2 py-1.5"><div class="flex gap-0.5">' +
      '<button onclick="jumpToRundownItem(' + idx + ')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-800 text-white">Play</button>' +
      '<button onclick="openItemModal(' + idx + ')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Edit</button>' +
      '<button onclick="skipRundownItem(' + idx + ')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-500">Skip</button>' +
    '</div></td></tr>'
  ).join('');
}

function skipRundownItem(idx) {
  const r = state.rundown[idx];
  if (!r) return;
  if (r.status === 'Playing' || r.status === 'Paused') {
    r.status = 'Skipped';
    if (state.autoDirector) autoDirectorStep();
    else {
      const next = state.rundown.find(x => x.status === 'Upcoming');
      if (next) executeItem(next);
    }
  } else if (r.status === 'Upcoming') {
    r.status = 'Skipped';
  }
  renderRundownTable();
  renderNewsDirectorPage();
}

function skipCurrentRundown() {
  const idx = state.rundown.findIndex(r => r.status === 'Playing' || r.status === 'Paused');
  if (idx >= 0) skipRundownItem(idx);
}

function resetRundownStatuses() {
  state.rundown.forEach((r, i) => {
    r.status = i === 0 ? 'Upcoming' : 'Upcoming';
  });
  state.itemRemaining = 0;
  state.autoDirector = false;
  const a1 = document.getElementById('auto-director');
  const a2 = document.getElementById('nd-auto');
  if (a1) a1.checked = false;
  if (a2) a2.checked = false;
  renderRundownTable();
  renderNewsDirectorPage();
  updateNewsDirectorUI();
}


function loadSettingsForm() {
  const s = state.settings || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val != null ? val : ''; };
  set('set-channel-name', s.channelName);
  set('set-tagline', s.tagline);
  set('set-logo', s.logoText);
  set('set-location', s.location);
  set('set-layout', s.defaultLayout || '2x2');
  set('set-bridge-url', s.bridgeUrl || 'ws://localhost:8787/bridge');
  set('set-public-url', s.publicBaseUrl || '');
  const prev = document.getElementById('set-public-preview');
  if (prev) {
    const ex = appPageUrl('guest.html', 'token=EXAMPLE');
    prev.innerHTML = (isFileOrigin() && !s.publicBaseUrl)
      ? '<span class="text-amber-400">file:// mode — set a Public site URL above for real share links</span>'
      : ('Guest example: ' + ex);
  }
  const stub = document.getElementById('set-bridge-stub');
  if (stub) stub.checked = s.bridgeStub !== false;
  const auto = document.getElementById('set-auto-director');
  if (auto) auto.checked = !!s.autoDirectorOnLoad;
  const st = document.getElementById('set-bridge-status');
  if (st && typeof bridge !== 'undefined') {
    st.textContent = 'Bridge mode: ' + (bridge.mode || '—') + (bridge.connected ? ' · connected' : ' · offline');
  }
}

function saveSettings() {
  const s = state.settings || (state.settings = {});
  s.channelName = document.getElementById('set-channel-name').value.trim() || s.channelName;
  s.tagline = document.getElementById('set-tagline').value.trim() || s.tagline;
  s.logoText = document.getElementById('set-logo').value.trim() || s.logoText;
  s.location = document.getElementById('set-location').value.trim() || s.location;
  s.defaultLayout = document.getElementById('set-layout').value;
  s.bridgeUrl = document.getElementById('set-bridge-url').value.trim();
  s.bridgeStub = document.getElementById('set-bridge-stub').checked;
  s.autoDirectorOnLoad = document.getElementById('set-auto-director').checked;
  const pubEl = document.getElementById('set-public-url');
  s.publicBaseUrl = pubEl ? pubEl.value.trim().replace(/\/+$/, '') : (s.publicBaseUrl || '');

  // Apply channel branding to graphics / header where possible
  if (state.graphics && state.graphics.logo) state.graphics.logo.text = s.logoText;
  if (state.graphics && state.graphics.loc) state.graphics.loc.text = s.location;
  if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram();
  if (typeof syncGfxEditors === 'function') syncGfxEditors();

  const headerChannel = document.querySelector('header .text-red-400');
  if (headerChannel && headerChannel.tagName === 'SPAN') headerChannel.textContent = s.channelName;
  // tagline sibling
  const spans = document.querySelectorAll('header span');
  spans.forEach(sp => {
    if (sp.className.includes('text-slate-500') && sp.className.includes('ml-1')) sp.textContent = s.tagline;
  });

  try {
    localStorage.setItem('bb_settings', JSON.stringify({
      channelName: s.channelName,
      tagline: s.tagline,
      logoText: s.logoText,
      location: s.location,
      defaultLayout: s.defaultLayout,
      autoDirectorOnLoad: s.autoDirectorOnLoad,
      bridgeUrl: s.bridgeUrl,
      publicBaseUrl: s.publicBaseUrl || '',
      bridgeStub: s.bridgeStub
    }));
  } catch (e) {}

  const msg = document.getElementById('set-msg');
  if (msg) { msg.textContent = 'Settings saved.'; msg.className = 'text-[10px] text-green-400 min-h-[18px]'; }
}

function applyBridgeSettings() {
  saveSettings();
  const s = state.settings;
  window.BRIDGE_WS_URL = s.bridgeUrl || 'ws://localhost:8787/bridge';
  window.BRIDGE_STUB_MODE = !!s.bridgeStub;
  if (typeof bridge !== 'undefined') {
    bridge.mode = s.bridgeStub ? 'stub' : 'live';
  }
  if (typeof bridgeReconnect === 'function') bridgeReconnect();
  const st = document.getElementById('set-bridge-status');
  if (st) st.textContent = 'Reconnecting (' + (s.bridgeStub ? 'stub' : 'live') + ')…';
}

function applyDefaultLayout() {
  const layout = document.getElementById('set-layout').value;
  if (state.settings) state.settings.defaultLayout = layout;
  if (typeof setLayout === 'function') setLayout(layout);
  const msg = document.getElementById('set-msg');
  if (msg) { msg.textContent = 'Layout applied: ' + layout; msg.className = 'text-[10px] text-green-400 min-h-[18px]'; }
}

function loadSettingsFromStorage() {
  try {
    const raw = localStorage.getItem('bb_settings');
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.settings = Object.assign(state.settings || {}, saved);
    if (state.graphics && state.graphics.logo && saved.logoText) state.graphics.logo.text = saved.logoText;
    if (state.graphics && state.graphics.loc && saved.location) state.graphics.loc.text = saved.location;
  } catch (e) {}
}


function renderAnalyticsPage() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('an-duration', formatTimer(state.timerSeconds || 0));
  set('an-viewers', (state.viewerCount || 0).toLocaleString());
  set('an-peak', (state.peakViewers || 0).toLocaleString());
  set('an-recs', String((state.recordings || []).length));

  let status = 'LIVE';
  if (state.emergency) status = 'EMERGENCY';
  else if (state.priority === 'BREAKING') status = 'BREAKING';
  else if (state.priority === 'AD') status = 'AD BREAK';
  else if (state.hold) status = 'HOLD';
  set('an-status', status);
  set('an-priority', state.priority || 'PROGRAM');
  set('an-layout', (LAYOUTS[state.layout] && LAYOUTS[state.layout].name) || state.layout || '—');
  set('an-program', typeof slotNames === 'function' ? slotNames(state.programSlots) : (state.programSlots || []).join(', '));
  set('an-takes', String(state.sessionTakes || 0));
  const adPlays = (state.ads || []).reduce((s, a) => s + (a.plays || 0), 0);
  set('an-adplays', String(adPlays));

  const st = (typeof bridge !== 'undefined' && bridge.getStatus) ? bridge.getStatus() : null;
  const dests = (st && st.destinations) || {};
  const labelDest = (d) => {
    if (!d) return 'unconfigured';
    if (d.streaming) return 'STREAMING';
    if (d.health === 'dry-run') return 'dry-run';
    if (d.health === 'error') return 'error';
    return d.health || (d.configured ? 'idle' : 'unconfigured');
  };
  set('an-yt', labelDest(dests.youtube));
  set('an-fb', labelDest(dests.facebook));
  set('an-rtmp', labelDest(dests.rtmp));
  const enc = (st && st.pipeline && st.pipeline.encoder) || {};
  set('an-enc', enc.dryRun && enc.state === 'live' ? 'dry-run' : (enc.state || 'offline'));

  // Viewer bars
  const hist = state.viewerHistory || [state.viewerCount || 0];
  const maxV = Math.max.apply(null, hist.concat([1]));
  const bars = document.getElementById('an-viewer-bars');
  if (bars) {
    bars.innerHTML = hist.slice(-24).map(v => {
      const h = Math.max(4, Math.round((v / maxV) * 100));
      return '<div class="flex-1 bg-cyan-700/80 rounded-t" style="height:' + h + '%" title="' + v + '"></div>';
    }).join('');
  }

  // Rundown
  const rd = document.getElementById('an-rundown');
  if (rd) {
    const done = state.rundown.filter(r => r.status === 'Completed').length;
    const total = state.rundown.length || 1;
    const pct = Math.round((done / total) * 100);
    const colors = { Completed: 'text-slate-500', Playing: 'text-green-400', Upcoming: 'text-blue-300', Paused: 'text-amber-400', Skipped: 'text-slate-600' };
    rd.innerHTML = '<div class="mb-2"><div class="flex justify-between text-[10px] text-slate-400 mb-0.5"><span>Progress</span><span>' + done + '/' + total + ' (' + pct + '%)</span></div>' +
      '<div class="h-1.5 rounded bg-[#0a0e17] overflow-hidden"><div class="h-full bg-blue-600" style="width:' + pct + '%"></div></div></div>' +
      state.rundown.map(r =>
        '<div class="flex gap-2 px-2 py-1 rounded bg-[#131a28]"><span class="text-slate-600 w-4">' + r.n + '</span>' +
        '<span class="flex-1 truncate text-slate-200">' + r.title + '</span>' +
        '<span class="text-[10px] ' + (colors[r.status] || '') + '">' + r.status + '</span></div>'
      ).join('');
  }

  // Content / ads
  const ct = document.getElementById('an-content');
  if (ct) {
    const rows = (state.ads || []).slice().sort((a, b) => (b.plays || 0) - (a.plays || 0)).map(a =>
      '<div class="flex justify-between px-2 py-1 rounded bg-[#131a28]"><span class="truncate text-slate-200">' + a.title + '</span>' +
      '<span class="text-slate-400">' + (a.plays || 0) + ' plays</span></div>'
    );
    ct.innerHTML = rows.join('') || '<div class="text-slate-500 px-2">No ad data</div>';
  }
}


function roleLabel(roleId) {
  const r = (state.roleDefs || []).find(x => x.id === roleId);
  return r ? r.label : roleId;
}

function renderUsersPage() {
  const body = document.getElementById('users-body');
  const roles = document.getElementById('roles-list');
  if (body) {
    body.innerHTML = state.users.map(u => {
      const me = u.id === state.currentUserId;
      const active = u.status === 'active';
      return '<tr class="border-t border-[#1e2a3a]/60 hover:bg-[#131a28]">' +
        '<td class="px-3 py-2"><div class="text-white font-medium">' + u.name + (me ? ' <span class="text-[8px] text-cyan-400">YOU</span>' : '') + '</div>' +
        '<div class="text-[9px] text-slate-500">' + u.email + '</div></td>' +
        '<td class="px-2 py-2 text-slate-300">' + roleLabel(u.role) + '</td>' +
        '<td class="px-2 py-2"><span class="' + (active ? 'text-green-400' : 'text-slate-500') + '">' + u.status + '</span></td>' +
        '<td class="px-2 py-2"><div class="flex gap-1">' +
          (active
            ? '<button onclick="setUserStatus(\'' + u.id + '\',\'offline\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Set offline</button>'
            : '<button onclick="setUserStatus(\'' + u.id + '\',\'active\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-900 text-green-300">Activate</button>') +
          (!me ? '<button onclick="removeUser(\'' + u.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-red-950 text-red-300">Remove</button>' : '') +
        '</div></td></tr>';
    }).join('');
  }
  if (roles) {
    roles.innerHTML = (state.roleDefs || []).map(r =>
      '<div class="px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a]">' +
        '<div class="text-slate-200 font-medium">' + r.label + '</div>' +
        '<div class="text-slate-500">' + r.desc + '</div></div>'
    ).join('');
  }
  const me = state.users.find(u => u.id === state.currentUserId);
  const elCount = document.getElementById('users-stat-count');
  const elActive = document.getElementById('users-stat-active');
  const elMe = document.getElementById('users-stat-me');
  if (elCount) elCount.textContent = String(state.users.length);
  if (elActive) elActive.textContent = String(state.users.filter(u => u.status === 'active').length);
  if (elMe && me) elMe.textContent = me.name + ' · ' + roleLabel(me.role);
}

function openUserModal() {
  document.getElementById('user-name').value = '';
  document.getElementById('user-email').value = '';
  document.getElementById('user-role').value = 'director';
  document.getElementById('user-modal').classList.remove('hidden');
}
function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
}
function saveUser() {
  const name = document.getElementById('user-name').value.trim() || 'New User';
  const email = document.getElementById('user-email').value.trim() || 'user@newsroom.tv';
  const role = document.getElementById('user-role').value;
  state.users.push({
    id: 'u_' + Math.random().toString(36).slice(2, 7),
    name, email, role, status: 'active'
  });
  closeUserModal();
  renderUsersPage();
}
function setUserStatus(id, status) {
  const u = state.users.find(x => x.id === id);
  if (u) u.status = status;
  renderUsersPage();
}
function removeUser(id) {
  if (id === state.currentUserId) return;
  state.users = state.users.filter(u => u.id !== id);
  renderUsersPage();
}


function slotNames(slots) {
  return (slots || []).map(id => {
    const s = getSource(id);
    return s ? s.name : id;
  }).join(' · ') || '—';
}

function renderHomeDashboard() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Broadcast status
  let bStatus = 'OFFLINE';
  let bSub = 'Not on air';
  let bClass = 'text-[18px] font-bold text-slate-400';
  const bsState = state.broadcastState || 'offline';
  if (bsState === 'live') { bStatus = 'LIVE'; bSub = 'On air (local Program)'; bClass = 'text-[18px] font-bold text-red-400'; }
  else if (bsState === 'starting') { bStatus = 'STARTING'; bSub = 'Going live…'; bClass = 'text-[18px] font-bold text-amber-400'; }
  else if (bsState === 'stopping') { bStatus = 'STOPPING'; bSub = 'Ending session…'; bClass = 'text-[18px] font-bold text-orange-400'; }
  else if (bsState === 'ended') { bStatus = 'ENDED'; bSub = 'Last duration ' + formatTimer(state.timerSeconds || 0); bClass = 'text-[18px] font-bold text-slate-400'; }
  if (state.emergency) { bStatus = 'EMERGENCY'; bSub = 'Emergency output'; bClass = 'text-[18px] font-bold text-red-500'; }
  else if (bsState === 'live' && state.priority === 'BREAKING') { bStatus = 'BREAKING'; bSub = 'Breaking priority'; bClass = 'text-[18px] font-bold text-orange-400'; }
  else if (bsState === 'live' && state.priority === 'AD') { bStatus = 'AD BREAK'; bSub = 'Advertisement on Program'; bClass = 'text-[18px] font-bold text-amber-400'; }
  else if (bsState === 'live' && state.hold) { bStatus = 'HOLD'; bSub = 'Program held'; bClass = 'text-[18px] font-bold text-amber-300'; }
  const bs = document.getElementById('home-broadcast-status');
  if (bs) { bs.textContent = bStatus; bs.className = bClass; }
  set('home-broadcast-sub', bSub);

  set('home-priority', state.priority || 'PROGRAM');
  const pSub = {
    EMERGENCY: 'Highest priority',
    BREAKING: 'Above ads & program',
    AD: 'Above normal program',
    PROGRAM: 'Normal stack',
    BACKGROUND: 'Background'
  };
  set('home-priority-sub', pSub[state.priority] || '—');
  set('home-timer', formatTimer(state.timerSeconds || 0));
  set('home-viewers', (state.viewerCount || 0).toLocaleString());
  if (state.viewerCount > (state.peakViewers || 0)) state.peakViewers = state.viewerCount;
  set('home-viewers-sub', 'Peak ' + (state.peakViewers || 0).toLocaleString());

  set('home-layout', (LAYOUTS[state.layout] && LAYOUTS[state.layout].name) || state.layout || '—');
  set('home-program', slotNames(state.programSlots));
  set('home-preview', slotNames(state.previewSlots));

  const playing = getPlayingItem();
  const next = state.rundown.find(r => r.status === 'Upcoming');
  set('home-rundown-now', playing ? playing.title : '—');
  set('home-rundown-next', next ? next.title : '—');
  set('home-item-clock', playing ? formatDur(state.itemRemaining || 0) : '—');
  set('home-auto', state.autoDirector ? 'Timed Auto ON' : 'Idle');

  // Destinations from bridge status
  const st = (typeof bridge !== 'undefined' && bridge.getStatus) ? bridge.getStatus() : null;
  const dests = (st && st.destinations) || {};
  ['youtube', 'facebook', 'rtmp'].forEach(k => {
    const d = dests[k] || {};
    let label = 'idle';
    if (d.streaming) label = 'STREAMING';
    else if (d.health === 'dry-run') label = 'dry-run';
    else if (d.health === 'error') label = 'error';
    else if (d.configured) label = d.health || 'configured';
    else label = 'unconfigured';
    const el = document.getElementById('home-dest-' + k);
    if (el) {
      el.textContent = label;
      el.className = d.streaming ? 'text-green-400 font-semibold' :
        (d.health === 'dry-run' ? 'text-amber-400' : 'text-slate-400');
    }
  });

  // Health
  const mode = (st && st.bridgeMode) || (typeof bridge !== 'undefined' && bridge.mode) || '—';
  const connected = !!(st && (st.connected || mode === 'stub')) || (typeof bridge !== 'undefined' && bridge.connected);
  set('home-health-bridge', connected ? (mode === 'stub' ? 'STUB' : 'CONNECTED') : 'OFFLINE');
  const pipe = (st && st.pipeline) || {};
  set('home-health-webrtc', (pipe.webrtc && pipe.webrtc.state) || 'offline');
  const enc = pipe.encoder || {};
  set('home-health-encoder', enc.dryRun && enc.state === 'live' ? 'live (dry-run)' : (enc.state || 'offline'));
  set('home-health-rtmp', (pipe.rtmp && pipe.rtmp.state) || 'offline');
  set('home-health-cam', state.media.localStream ? 'LIVE' : 'Off');
  set('home-health-rec', state.media.recording ? 'RECORDING' : (state.recordings.length ? state.recordings.length + ' saved' : 'Idle'));
  const master = state.audio && state.audio.master;
  set('home-health-audio', master ? ((master.mute ? 'MUTED ' : '') + master.level + '%') : '—');

  // Rundown list
  const list = document.getElementById('home-rundown-list');
  if (list) {
    const colors = { Completed: 'text-slate-500', Playing: 'text-green-400', Paused: 'text-amber-400', Upcoming: 'text-blue-300', Skipped: 'text-slate-600' };
    list.innerHTML = state.rundown.slice(0, 8).map(r =>
      '<div class="flex items-center gap-2 px-2 py-1 rounded bg-[#131a28]">' +
        '<span class="text-slate-600 w-4">' + r.n + '</span>' +
        '<span class="flex-1 text-slate-200 truncate">' + r.title + '</span>' +
        '<span class="font-mono text-[10px] text-slate-500">' + r.dur + '</span>' +
        '<span class="text-[10px] w-16 text-right ' + (colors[r.status] || 'text-slate-400') + '">' + r.status + '</span>' +
      '</div>'
    ).join('') || '<div class="text-slate-500 px-2">No rundown items</div>';
  }
}


function renderSources() {
  const filtered = state.sourceFilter === 'all' ? state.sources : state.sources.filter(s => s.type === state.sourceFilter);
  const onAir = new Set(state.programSlots);
  document.getElementById('sources-list').innerHTML = filtered.map(s => {
    const isOnAir = onAir.has(s.id);
    const live = s.hasStream || s.status === 'live';
          '<button onclick="selectSource(\'' + s.id + '\'); renderSourcesPage();" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-800 text-white">Preview</button>' +
      '<div class="w-7 h-7 rounded flex items-center justify-center text-sm shrink-0" style="background:' + s.color + '55">' + s.icon + '</div>' +
      '<div class="min-w-0 flex-1"><div class="text-[11px] font-medium text-white truncate">' + s.name + (isOnAir ? ' <span class="text-[8px] px-1 rounded bg-red-600 text-white font-bold">ON AIR</span>' : '') + (live && s.id === 'cam1' ? ' <span class="text-[8px] text-green-400">●</span>' : '') + '</div>' +
      '<div class="text-[9px] text-slate-500">' + s.role + ' · ' + s.res + '</div></div></button>';
  }).join('');
  if (state.currentView === 'sources' && typeof renderSourcesPage === 'function') renderSourcesPage();

  document.getElementById('source-select').innerHTML = state.sources.map(s => '<option value="' + s.id + '">' + s.name + '</option>').join('');
  document.getElementById('source-engine-status').textContent = filtered.length + ' sources';
}

document.getElementById('source-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.source-tab'); if (!btn) return;
  state.sourceFilter = btn.dataset.tab;
  document.querySelectorAll('.source-tab').forEach(b => {
    b.className = b === btn ? 'source-tab tab-active text-[9px] px-1.5 py-0.5 rounded border border-blue-500' : 'source-tab text-[9px] px-1.5 py-0.5 rounded border border-[#1e2a3a] bg-[#131a28] text-slate-400';
  });
  renderSources();
});


// ========== DIRECTOR BRIDGE CLIENT ==========
const bridge = new DirectorBridgeClient({
  mode: 'stub',
  broadcastId: 'bb-local-broadcast'
});

function setPipeLabel(id, text, kind) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'font-semibold ' + (
    kind === 'live' ? 'text-green-400' :
    kind === 'warn' ? 'text-amber-400' :
    kind === 'err' ? 'text-red-400' : 'text-slate-400'
  );
}

function applyBridgeStatusToUI(status) {
  if (!status) return;
  const bridgePill = document.getElementById('bridge-pill');
  const bridgeMode = document.getElementById('bridge-mode');
  const bridgeSeq = document.getElementById('bridge-seq');
  const mode = status.bridgeMode || (bridge && bridge.mode) || '—';
  const connected = !!(status.connected || mode === 'stub' || (bridge && bridge.connected));

  if (bridgePill) {
    if (connected) {
      bridgePill.textContent = mode === 'stub' ? 'STUB' : 'CONNECTED';
      bridgePill.className = 'text-[9px] px-1.5 py-0.5 rounded bg-cyan-900 border border-cyan-600 text-cyan-300 font-semibold';
    } else {
      bridgePill.textContent = 'OFFLINE';
      bridgePill.className = 'text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold';
    }
  }
  if (bridgeMode) bridgeMode.textContent = 'mode: ' + mode;
  if (bridgeSeq) bridgeSeq.textContent = 'seq: ' + ((status.program && status.program.sequence) || 0);

  const pipe = status.pipeline || {};
  const webrtc = (pipe.webrtc && pipe.webrtc.state) || 'offline';
  const encObj = pipe.encoder || {};
  const enc = encObj.state || 'offline';
  const rtmp = (pipe.rtmp && pipe.rtmp.state) || 'offline';
  const dry = !!encObj.dryRun || rtmp === 'dry-run';

  setPipeLabel('pipe-webrtc', webrtc, webrtc === 'live' ? 'live' : 'idle');
  setPipeLabel('pipe-encoder', dry && enc === 'live' ? 'live (dry-run)' : enc, enc === 'live' ? (dry ? 'warn' : 'live') : (enc === 'error' ? 'err' : 'idle'));
  setPipeLabel('pipe-rtmp', rtmp, rtmp === 'live' ? 'live' : (rtmp === 'dry-run' ? 'warn' : 'idle'));

  const dests = status.destinations || {};
  ['youtube', 'facebook', 'rtmp'].forEach(k => {
    const el = document.getElementById('dest-' + k);
    if (!el) return;
    const d = dests[k] || {};
    if (d.streaming) {
      el.textContent = 'STREAMING';
      el.className = 'text-green-400 font-semibold';
    } else if (d.health === 'dry-run') {
      el.textContent = 'dry-run';
      el.className = 'text-amber-400 font-semibold';
    } else if (d.health === 'error') {
      el.textContent = 'error';
      el.className = 'text-red-400 font-semibold';
    } else if (d.configured) {
      el.textContent = d.health || 'idle';
      el.className = 'text-slate-400';
    } else {
      el.textContent = 'unconfigured';
      el.className = 'text-slate-500';
    }
  });

  // Header media badge — honest
  const mediaBadge = document.getElementById('media-badge');
  if (mediaBadge) {
    if (dests.youtube && dests.youtube.streaming) {
      mediaBadge.textContent = 'STREAMING';
      mediaBadge.className = 'px-2 py-0.5 rounded bg-green-900 border border-green-600 text-green-300 font-medium';
    } else if (dry && enc === 'live') {
      mediaBadge.textContent = 'DRY-RUN';
      mediaBadge.className = 'px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-medium';
    } else if (state.media && state.media.localStream) {
      mediaBadge.textContent = 'LOCAL';
      mediaBadge.className = 'px-2 py-0.5 rounded bg-cyan-900 border border-cyan-600 text-cyan-300 font-medium';
    } else {
      mediaBadge.textContent = mode === 'stub' ? 'STUB' : 'OFFLINE';
      mediaBadge.className = 'px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-medium';
    }
  }

  const sub = document.getElementById('sidebar-media-sub');
  if (sub) {
    if (dests.youtube && dests.youtube.streaming) sub.textContent = 'STREAMING';
    else if (dry && enc === 'live') sub.textContent = 'ENCODER DRY-RUN';
    else if (state.media && state.media.localStream) sub.textContent = 'CAMERA LIVE';
    else sub.textContent = mode === 'stub' ? 'BRIDGE STUB' : 'NOT CONNECTED';
  }

  const modeBtn = document.getElementById('btn-bridge-mode');
  if (modeBtn && bridge) {
    modeBtn.textContent = bridge.mode === 'stub' ? 'Use Live WS' : 'Use Stub';
  }

  // Destinations page cards
  const pageBridge = document.getElementById('dest-page-bridge');
  if (pageBridge) {
    const mode = status.bridgeMode || (bridge && bridge.mode) || '—';
    pageBridge.textContent = connected ? ('Bridge ' + (mode === 'stub' ? 'STUB' : 'CONNECTED')) : 'Bridge OFFLINE';
    pageBridge.className = 'text-[10px] px-2 py-0.5 rounded border font-medium ' + (
      connected ? 'bg-cyan-950 border-cyan-700 text-cyan-300' : 'bg-slate-800 border-slate-600 text-slate-300'
    );
  }
  const pipeMap = [
    ['dest-pipe-webrtc', webrtc],
    ['dest-pipe-encoder', dry && enc === 'live' ? 'live (dry-run)' : enc],
    ['dest-pipe-rtmp', rtmp]
  ];
  pipeMap.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
  ['youtube', 'facebook', 'rtmp'].forEach(k => {
    const d = dests[k] || {};
    const healthEl = document.getElementById('dest-card-' + k + '-health');
    const badgeEl = document.getElementById('dest-card-' + k + '-badge');
    if (healthEl) healthEl.textContent = d.health || (d.configured ? 'configured' : 'unconfigured');
    if (badgeEl) {
      if (d.streaming) {
        badgeEl.textContent = 'STREAMING';
        badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded bg-green-900 text-green-300 font-semibold';
      } else if (d.health === 'dry-run') {
        badgeEl.textContent = 'DRY-RUN';
        badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded bg-amber-900 text-amber-300 font-semibold';
      } else if (d.health === 'error') {
        badgeEl.textContent = 'ERROR';
        badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded bg-red-900 text-red-300 font-semibold';
      } else {
        badgeEl.textContent = 'IDLE';
        badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold';
      }
    }
  });
}

function bridgeMsg(text, kind) {
  const el = document.getElementById('bridge-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'text-[9px] mb-2 min-h-[28px] leading-tight ' + (
    kind === 'ok' ? 'text-green-400' : kind === 'err' ? 'text-red-400' : kind === 'warn' ? 'text-amber-400' : 'text-slate-500'
  );
}

function bridgeStartDest(destination) {
  if (!bridge || !bridge.connected) {
    bridgeMsg('Bridge offline — click Reconnect', 'err');
    destPageMsg('Bridge offline — click Reconnect', 'err');
    return;
  }
  const creds = readDestCredentials(destination);
  bridgeMsg('Starting ' + destination + '…', 'warn');
  destPageMsg('Starting ' + destination + '…', 'warn');
  audit('DEST_START', destination);
  bridge.send('destination.control', {
    destination: destination,
    action: 'start',
    streamUrl: creds.url || undefined,
    streamKey: creds.key || undefined
  });
}

function readDestCredentials(destination) {
  const map = {
    youtube: ['dest-yt-url', 'dest-yt-key'],
    facebook: ['dest-fb-url', 'dest-fb-key'],
    rtmp: ['dest-rtmp-url', 'dest-rtmp-key']
  };
  const ids = map[destination] || [];
  const urlEl = ids[0] && document.getElementById(ids[0]);
  const keyEl = ids[1] && document.getElementById(ids[1]);
  return {
    url: (urlEl && urlEl.value.trim()) || (state.destLocal[destination] && state.destLocal[destination].url) || '',
    key: (keyEl && keyEl.value) || ''
  };
}

function destSaveLocal(destination) {
  const creds = readDestCredentials(destination);
  // Persist URL only — never stream key in localStorage
  state.destLocal[destination] = state.destLocal[destination] || {};
  state.destLocal[destination].url = creds.url;
  try {
    const store = JSON.parse(localStorage.getItem('bb_dest_urls') || '{}');
    store[destination] = { url: creds.url };
    localStorage.setItem('bb_dest_urls', JSON.stringify(store));
  } catch (e) {}
  destPageMsg('Saved ' + destination + ' URL locally (key not stored).', 'ok');
}

function loadDestLocalIntoForm() {
  try {
    const store = JSON.parse(localStorage.getItem('bb_dest_urls') || '{}');
    state.destLocal = Object.assign({ youtube: { url: '' }, facebook: { url: '' }, rtmp: { url: '' } }, store);
  } catch (e) {}
  const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  set('dest-yt-url', state.destLocal.youtube && state.destLocal.youtube.url);
  set('dest-fb-url', state.destLocal.facebook && state.destLocal.facebook.url);
  set('dest-rtmp-url', state.destLocal.rtmp && state.destLocal.rtmp.url);
}

function destPageMsg(text, kind) {
  const el = document.getElementById('dest-page-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'mt-2 text-[10px] min-h-[20px] ' + (
    kind === 'ok' ? 'text-green-400' : kind === 'err' ? 'text-red-400' : kind === 'warn' ? 'text-amber-400' : 'text-slate-500'
  );
}


function bridgeStopDest(destination) {
  if (!bridge || !bridge.connected) {
    bridgeMsg('Bridge offline — click Reconnect', 'err');
    destPageMsg('Bridge offline — click Reconnect', 'err');
    return;
  }
  bridgeMsg('Stopping ' + destination + '…', 'warn');
  destPageMsg('Stopping ' + destination + '…', 'warn');
  bridge.send('destination.control', { destination: destination, action: 'stop' });
}

function bridgeReconnect() {
  bridgeMsg('Reconnecting…', 'warn');
  try { bridge.disconnect(); } catch (e) {}
  bridge.connect().then(() => {
    notifyBridgeState();
    applyBridgeStatusToUI(bridge.getStatus());
    bridgeMsg('Bridge connected (' + bridge.mode + ')', 'ok');
  }).catch(err => {
    bridgeMsg('Connect failed: ' + (err && err.message || err), 'err');
  });
}

function bridgeToggleMode() {
  if (!bridge) return;
  if (bridge.mode === 'stub') {
    // Switch to live
    window.BRIDGE_WS_URL = window.BRIDGE_WS_URL || 'ws://localhost:8787/bridge';
    window.BRIDGE_STUB_MODE = false;
    bridge.mode = 'live';
    bridgeMsg('Switching to live WS: ' + window.BRIDGE_WS_URL, 'warn');
  } else {
    window.BRIDGE_STUB_MODE = true;
    bridge.mode = 'stub';
    bridgeMsg('Switching to stub Bridge', 'warn');
  }
  bridgeReconnect();
}


function notifyBridgeTake(transition) {
  if (!bridge || !bridge.connected) return;
  bridge.publishTake({
    layout: state.layout,
    programSlots: state.programSlots,
    previewSlots: state.previewSlots,
    priority: state.priority,
    hold: state.hold,
    graphics: state.graphics
  }, transition || { type: 'CUT', durationMs: 0 });
}

function notifyBridgeState() {
  if (!bridge || !bridge.connected) return;
  bridge.publishProductionState({
    layout: state.layout,
    programSlots: state.programSlots,
    previewSlots: state.previewSlots,
    priority: state.priority,
    hold: state.hold,
    graphics: state.graphics
  });
}



// ========== ADS (Module 09 — deeper scheduling) ==========
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function parseTimeToMin(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function inDateWindow(ad) {
  const t = todayISO();
  if (ad.startDate && t < ad.startDate) return false;
  if (ad.endDate && t > ad.endDate) return false;
  return true;
}
function inDaypart(ad) {
  const n = nowMinutes();
  const a = parseTimeToMin(ad.dayStart || '00:00');
  const b = parseTimeToMin(ad.dayEnd || '23:59');
  if (a <= b) return n >= a && n <= b;
  // overnight window
  return n >= a || n <= b;
}
function gapOk(ad) {
  if (!ad.lastPlayedAt || !ad.minGapMin) return true;
  const elapsed = (Date.now() - ad.lastPlayedAt) / 60000;
  return elapsed >= (ad.minGapMin || 0);
}
function underCaps(ad) {
  if (ad.maxPerDay && (ad.playsToday || 0) >= ad.maxPerDay) return false;
  if (ad.maxTotal && (ad.plays || 0) >= ad.maxTotal) return false;
  return true;
}
function isAdEligible(ad) {
  return ad.status === 'approved' && inDateWindow(ad) && inDaypart(ad) && gapOk(ad) && underCaps(ad);
}
function adEligibilityReason(ad) {
  if (ad.status === 'pending') return 'pending review';
  if (ad.status === 'paused') return 'paused';
  if (!inDateWindow(ad)) return 'outside date window';
  if (!inDaypart(ad)) return 'outside daypart';
  if (!gapOk(ad)) return 'min gap';
  if (!underCaps(ad)) return 'cap reached';
  if (ad.status === 'approved') return 'eligible';
  return ad.status;
}
function getEligibleAds() {
  return state.ads
    .filter(isAdEligible)
    .sort((a, b) => (a.priority || 2) - (b.priority || 2) || (a.playsToday || 0) - (b.playsToday || 0));
}
function pickNextScheduledAd() {
  const list = getEligibleAds();
  return list[0] || null;
}

function renderAds() {
  const list = document.getElementById('ads-list');
  if (!list) return;
  let rows = state.ads.slice();
  if (state.adFilter === 'eligible') rows = rows.filter(isAdEligible);
  if (state.adFilter === 'scheduled') rows = rows.filter(a => a.startDate || a.endDate || a.campaign);

  list.innerHTML = rows.map(a => {
    const eligible = isAdEligible(a);
    const playing = state.activeAd && state.activeAd.id === a.id;
    const reason = adEligibilityReason(a);
    return '<div class="p-1 rounded border ' + (playing ? 'bg-amber-950/50 border-amber-600' : eligible ? 'bg-[#131a28] border-amber-900/40' : 'bg-[#131a28] border-transparent opacity-70') + '">' +
      '<div class="text-[10px] text-white font-medium truncate">' + a.title + '</div>' +
      '<div class="text-[8px] text-slate-500 truncate">' + (a.campaign || '—') + ' · P' + (a.priority || 2) + '</div>' +
      '<div class="text-[8px] text-slate-500">' + (a.startDate || '?') + '→' + (a.endDate || '?') + ' · ' + (a.dayStart || '') + '-' + (a.dayEnd || '') + '</div>' +
      '<div class="text-[8px] flex justify-between mt-0.5">' +
        '<span class="text-slate-400">' + (a.playsToday || 0) + '/' + (a.maxPerDay || '∞') + ' today · ' + (a.plays || 0) + ' total</span>' +
        '<span class="' + (eligible ? 'text-green-400' : 'text-amber-500') + '">' + reason + '</span></div>' +
      '<div class="flex flex-wrap gap-0.5 mt-0.5">' +
      (a.status === 'pending'
        ? '<button onclick="approveAd(\'' + a.id + '\')" class="text-[8px] px-1 rounded bg-green-800 text-white">Approve</button>'
        : '<button onclick="playAd(\'' + a.id + '\')" class="text-[8px] px-1 rounded bg-amber-700 text-white">Play</button>') +
      '<button onclick="queueAdInRundown(\'' + a.id + '\')" class="text-[8px] px-1 rounded bg-[#1e2a3a] text-slate-300">Queue</button>' +
      '<button onclick="openAdModal(\'' + a.id + '\')" class="text-[8px] px-1 rounded bg-[#1e2a3a] text-slate-400">Edit</button>' +
      '</div></div>';
  }).join('') || '<div class="text-[9px] text-slate-500 p-1">No ads in filter</div>';

  const sum = document.getElementById('ads-schedule-summary');
  if (sum) {
    const elig = getEligibleAds().length;
    sum.textContent = elig + ' eligible now · ' + state.ads.filter(a => a.status === 'approved').length + ' approved · filter: ' + state.adFilter;
  }

  const now = document.getElementById('ads-now');
  if (state.activeAd) {
    now.classList.remove('hidden');
    document.getElementById('ads-now-title').textContent = state.activeAd.title;
    document.getElementById('ads-now-countdown').textContent = formatDur(state.adRemaining);
  } else if (now) {
    now.classList.add('hidden');
  }

  if (state.currentView === 'ads') renderAdsPage();
}

function playAd(id) {
  if (state.priority === 'EMERGENCY') return;
  const ad = state.ads.find(a => a.id === id);
  if (!ad || ad.status !== 'approved') return;
  // Soft warn if outside schedule but allow operator override
  if (!isAdEligible(ad)) {
    const ok = confirm('Ad is not currently eligible (' + adEligibilityReason(ad) + '). Play anyway?');
    if (!ok) return;
  }

  if (!state.activeAd) {
    state.resumeSlots = state.resumeSlots || [...state.programSlots];
  }
  state.activeAd = { id: ad.id, title: ad.title, advertiser: ad.advertiser };
  state.adRemaining = ad.durSec;
  ad.plays = (ad.plays || 0) + 1;
  ad.playsToday = (ad.playsToday || 0) + 1;
  ad.lastPlayedAt = Date.now();

  setLayout('fullscreen');
  state.previewSlots = ['ad_spot'];
  state.programSlots = ['ad_spot'];
  setPriority('AD');
  renderPreview();
  renderProgram();
  renderSources();
  renderAds();
  notifyBridgeState();
  showAdOverlay(ad);
  audit('AD_PLAY', ad.title);
}

function showAdOverlay(ad) {
  let el = document.getElementById('ad-overlay');
  if (!el) {
    const mon = document.getElementById('program-monitor');
    el = document.createElement('div');
    el.id = 'ad-overlay';
    el.className = 'absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-amber-950 to-black';
    mon.appendChild(el);
  }
  el.innerHTML = '<div class="text-[10px] font-bold text-amber-400 tracking-widest mb-1">ADVERTISEMENT</div>' +
    '<div class="text-[9px] text-amber-600/90 mb-2">' + (ad.campaign || '') + '</div>' +
    '<div class="text-xl font-black text-white text-center px-4">' + ad.title + '</div>' +
    '<div class="text-[11px] text-amber-200/80 mt-1">' + ad.advertiser + '</div>' +
    '<div class="mt-4 font-mono text-amber-300 text-sm" id="ad-overlay-count">' + formatDur(state.adRemaining) + '</div>' +
    '<button onclick="stopAd()" class="mt-4 px-3 py-1 rounded bg-slate-700 text-white text-[10px]">End Ad</button>';
  el.classList.remove('hidden');
}

function hideAdOverlay() {
  const el = document.getElementById('ad-overlay');
  if (el) el.classList.add('hidden');
}

function stopAd() {
  if (!state.activeAd) return;
  const title = state.activeAd.title;
  state.activeAd = null;
  state.adRemaining = 0;
  hideAdOverlay();
  audit('AD_STOP', title || 'Ad ended');
  if (state.priority === 'EMERGENCY') { renderAds(); return; }
  if (state.breaking) setPriority('BREAKING');
  else setPriority('PROGRAM');
  if (state.resumeSlots) {
    state.programSlots = [...state.resumeSlots];
    state.resumeSlots = null;
  }
  renderPreview();
  renderProgram();
  renderSources();
  renderAds();
  notifyBridgeState();
}

function approveAd(id) {
  const ad = state.ads.find(a => a.id === id);
  if (ad) { ad.status = 'approved'; renderAds(); }
}

function queueAdInRundown(id) {
  const ad = state.ads.find(a => a.id === id);
  if (!ad) return;
  if (ad.status !== 'approved') { alert('Approve ad before queueing'); return; }
  state.rundown.push({
    n: state.rundown.length + 1,
    type: 'Ad',
    title: ad.title,
    dur: ad.dur,
    durSec: ad.durSec,
    status: 'Upcoming',
    source: 'Ads',
    notes: 'Scheduled · ' + (ad.campaign || ad.advertiser) + ' · gap ' + (ad.minGapMin || 0) + 'm',
    adId: ad.id
  });
  state.rundown.forEach((r, i) => { r.n = i + 1; });
  renderRundownTable();
}

/** Insert eligible ads into rundown at sensible break points (after every 2 non-ad items). */
function runAdScheduler() {
  const eligible = getEligibleAds();
  if (!eligible.length) {
    alert('No eligible ads right now (check daypart, dates, caps, gaps).');
    return;
  }
  // Remove previously auto-scheduled upcoming ads (notes start with Scheduled ·)
  state.rundown = state.rundown.filter(r => !(r.type === 'Ad' && r.status === 'Upcoming' && (r.notes || '').startsWith('Scheduled ·')));

  const rebuilt = [];
  let contentStreak = 0;
  let ei = 0;
  for (const item of state.rundown) {
    rebuilt.push(item);
    if (item.type === 'Ad') {
      contentStreak = 0;
      continue;
    }
    contentStreak++;
    if (contentStreak >= 2 && ei < eligible.length && item.status !== 'Completed') {
      const ad = eligible[ei++ % eligible.length];
      rebuilt.push({
        n: 0,
        type: 'Ad',
        title: ad.title,
        dur: ad.dur,
        durSec: ad.durSec,
        status: 'Upcoming',
        source: 'Ads',
        notes: 'Scheduled · ' + (ad.campaign || ad.advertiser),
        adId: ad.id
      });
      contentStreak = 0;
    }
  }
  // If rundown short, append one break
  if (ei === 0 && eligible[0]) {
    const ad = eligible[0];
    rebuilt.push({
      n: 0, type: 'Ad', title: ad.title, dur: ad.dur, durSec: ad.durSec,
      status: 'Upcoming', source: 'Ads', notes: 'Scheduled · ' + (ad.campaign || ad.advertiser), adId: ad.id
    });
  }
  state.rundown = rebuilt;
  state.rundown.forEach((r, i) => { r.n = i + 1; });
  renderRundownTable();
  renderAds();
}

function openAdModal(editId) {
  document.getElementById('ad-edit-id').value = editId || '';
  const ad = editId ? state.ads.find(a => a.id === editId) : null;
  document.getElementById('ad-title').value = ad ? ad.title : '';
  document.getElementById('ad-advertiser').value = ad ? ad.advertiser : '';
  document.getElementById('ad-dur').value = ad ? ad.dur : '00:30';
  document.getElementById('ad-status').value = ad ? ad.status : 'approved';
  document.getElementById('ad-priority').value = String(ad ? (ad.priority || 2) : 2);
  document.getElementById('ad-start').value = ad ? (ad.startDate || '') : todayISO();
  document.getElementById('ad-end').value = ad ? (ad.endDate || '') : '';
  document.getElementById('ad-day-start').value = ad ? (ad.dayStart || '06:00') : '06:00';
  document.getElementById('ad-day-end').value = ad ? (ad.dayEnd || '23:00') : '23:00';
  document.getElementById('ad-max-day').value = ad ? (ad.maxPerDay || 8) : 8;
  document.getElementById('ad-max-total').value = ad ? (ad.maxTotal || 50) : 50;
  document.getElementById('ad-gap').value = ad ? (ad.minGapMin || 10) : 10;
  document.getElementById('ad-campaign').value = ad ? (ad.campaign || '') : '';
  document.getElementById('ad-modal').classList.remove('hidden');
}
function closeAdModal() { document.getElementById('ad-modal').classList.add('hidden'); }
function saveAd() {
  const editId = document.getElementById('ad-edit-id').value;
  const data = {
    title: document.getElementById('ad-title').value.trim() || 'Untitled Ad',
    advertiser: document.getElementById('ad-advertiser').value.trim() || 'Advertiser',
    dur: document.getElementById('ad-dur').value || '00:30',
    durSec: parseDur(document.getElementById('ad-dur').value || '00:30'),
    status: document.getElementById('ad-status').value,
    priority: Number(document.getElementById('ad-priority').value) || 2,
    startDate: document.getElementById('ad-start').value || null,
    endDate: document.getElementById('ad-end').value || null,
    dayStart: document.getElementById('ad-day-start').value || '00:00',
    dayEnd: document.getElementById('ad-day-end').value || '23:59',
    maxPerDay: Number(document.getElementById('ad-max-day').value) || 0,
    maxTotal: Number(document.getElementById('ad-max-total').value) || 0,
    minGapMin: Number(document.getElementById('ad-gap').value) || 0,
    campaign: document.getElementById('ad-campaign').value.trim() || '',
  };
  if (editId) {
    const ad = state.ads.find(a => a.id === editId);
    if (ad) Object.assign(ad, data);
  } else {
    state.ads.push({
      id: 'ad_' + Math.random().toString(36).slice(2, 7),
      plays: 0, playsToday: 0, lastPlayedAt: null,
      ...data
    });
  }
  closeAdModal();
  renderAds();
}


// ========== AUDIO MIXER (Module 10 lite) ==========
function renderAudioMixer() {
  const box = document.getElementById('audio-channels');
  if (!box) return;
  const anySolo = state.audio.channels.some(c => c.solo);
  box.innerHTML = state.audio.channels.map(ch => {
    const dim = anySolo && !ch.solo;
    return '<div class="px-1 py-1 rounded bg-[#131a28] border border-[#1e2a3a] ' + (dim ? 'opacity-40' : '') + '">' +
      '<div class="flex items-center justify-between mb-0.5">' +
        '<span class="text-[9px] text-white truncate">' + ch.name + '</span>' +
        '<div class="flex gap-0.5">' +
          '<button onclick="toggleAudioSolo(\'' + ch.id + '\')" class="text-[7px] px-1 rounded ' + (ch.solo ? 'bg-amber-600 text-white' : 'bg-[#1e2a3a] text-slate-400') + '">S</button>' +
          '<button onclick="toggleAudioMute(\'' + ch.id + '\')" id="aud-mute-' + ch.id + '" class="text-[7px] px-1 rounded ' + (ch.mute ? 'bg-red-700 text-white' : 'bg-[#1e2a3a] text-slate-400') + '">M</button>' +
        '</div></div>' +
      '<input type="range" min="0" max="100" value="' + ch.level + '" class="w-full h-1 accent-emerald-500" oninput="setAudioLevel(\'' + ch.id + '\', this.value)" />' +
      '<div class="flex justify-between text-[7px] text-slate-500"><span id="aud-val-' + ch.id + '">' + ch.level + '</span>' +
      '<div class="w-12 h-1 mt-0.5 rounded bg-[#0a0e17] overflow-hidden align-middle"><div id="aud-meter-' + ch.id + '" class="h-full bg-emerald-500" style="width:' + effectiveAudioMeter(ch) + '%"></div></div></div>' +
    '</div>';
  }).join('');

  const master = state.audio.master;
  const mf = document.getElementById('aud-fader-master');
  if (mf) mf.value = master.level;
  const mv = document.getElementById('aud-val-master');
  if (mv) mv.textContent = master.level;
  const mm = document.getElementById('aud-mute-master');
  if (mm) {
    mm.textContent = master.mute ? 'MUTED' : 'MUTE';
    mm.className = 'text-[8px] px-1 rounded ' + (master.mute ? 'bg-red-700 text-white' : 'bg-[#1e2a3a] text-slate-300');
  }
  applyLocalAudioGain();
}

function effectiveAudioMeter(ch) {
  if (state.audio.master.mute || ch.mute) return 2;
  const anySolo = state.audio.channels.some(c => c.solo);
  if (anySolo && !ch.solo) return 2;
  const lvl = (ch.level / 100) * (state.audio.master.level / 100);
  // mild activity simulation
  const flicker = 0.75 + Math.random() * 0.25;
  return Math.round(lvl * 100 * flicker);
}

function setAudioLevel(id, value) {
  const v = Math.max(0, Math.min(100, Number(value)));
  if (id === 'master') {
    state.audio.master.level = v;
  } else {
    const ch = state.audio.channels.find(c => c.id === id);
    if (ch) ch.level = v;
  }
  const label = document.getElementById('aud-val-' + id);
  if (label) label.textContent = v;
  applyLocalAudioGain();
  // light bridge notify (optional, throttled by not on every input end - ok for now)
}

function toggleAudioMute(id) {
  if (id === 'master') {
    state.audio.master.mute = !state.audio.master.mute;
  } else {
    const ch = state.audio.channels.find(c => c.id === id);
    if (ch) ch.mute = !ch.mute;
  }
  renderAudioMixer();
}

function toggleAudioSolo(id) {
  const ch = state.audio.channels.find(c => c.id === id);
  if (!ch) return;
  ch.solo = !ch.solo;
  renderAudioMixer();
}

function audioReset() {
  state.audio.master = { level: 80, mute: false, solo: false };
  state.audio.channels.forEach(c => { c.level = 75; c.mute = false; c.solo = false; });
  renderAudioMixer();
}

function applyLocalAudioGain() {
  // Real gain only for local mic track when present
  if (!state.media.localStream) return;
  const tracks = state.media.localStream.getAudioTracks();
  if (!tracks.length) return;
  const ch = state.audio.channels.find(c => c.id === 'cam1') || state.audio.channels[0];
  const muted = state.audio.master.mute || (ch && ch.mute);
  tracks.forEach(tr => { tr.enabled = !muted; });
  // Web Audio gain would go here when full audio graph exists
}

function tickAudioMeters() {
  if (!state.audio) return;
  state.audio.channels.forEach(ch => {
    const el = document.getElementById('aud-meter-' + ch.id);
    if (el) el.style.width = effectiveAudioMeter(ch) + '%';
  });
  const masterEl = document.getElementById('aud-meter-master');
  if (masterEl) {
    const m = state.audio.master;
    if (m.mute) masterEl.style.width = '2%';
    else {
      const avg = state.audio.channels.reduce((s, c) => s + effectiveAudioMeter(c), 0) / Math.max(1, state.audio.channels.length);
      masterEl.style.width = Math.round(avg * (m.level / 100)) + '%';
    }
  }
}


// INIT
renderNav(); renderSources(); renderPreview(); renderProgram();
renderGuests(); renderRundownTable(); renderAds();
document.querySelectorAll('.ad-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    state.adFilter = btn.getAttribute('data-adfilter') || 'all';
    document.querySelectorAll('.ad-filter').forEach(b => {
      const on = b === btn;
      b.className = on
        ? 'ad-filter tab-active text-[8px] px-1 py-0.5 rounded border border-amber-600 text-amber-200'
        : 'ad-filter text-[8px] px-1 py-0.5 rounded border border-[#1e2a3a] bg-[#131a28] text-slate-400';
    });
    renderAds();
  });
});
applyGraphicsToProgram(); Object.keys(state.graphics).forEach(updateToggleUI); syncGfxEditors();
updateProgramEngineUI(); updateNewsDirectorUI();
const playing = getPlayingItem();
if (playing) state.itemRemaining = playing.durSec;

// Director Bridge (stub)
bridge.on('status', applyBridgeStatusToUI);
bridge.on('connection', (c) => {
  applyBridgeStatusToUI(bridge.getStatus());
  console.info('[Bridge]', c.mode, c.connected ? 'connected' : 'disconnected');
});
bridge.on('ack', (msg) => {
  if (msg.type === 'nack') {
    console.warn('[Bridge nack]', msg.payload);
    bridgeMsg((msg.payload && (msg.payload.code + ': ' + msg.payload.message)) || 'Nack', 'err');
  } else if (msg.type === 'ack') {
    const p = msg.payload || {};
    if (p.dryRun) { bridgeMsg(p.message || 'Encoder dry-run started', 'warn'); destPageMsg(p.message || 'Encoder dry-run started', 'warn'); }
    else if (p.message) { bridgeMsg(p.message, 'ok'); destPageMsg(p.message, 'ok'); }
  } else if (msg.type === 'hello.ok') {
    bridgeMsg('hello.ok — bridge ' + ((msg.payload && msg.payload.bridgeVersion) || ''), 'ok');
  }
});
bridge.on('error', (e) => {
  console.warn('[Bridge error]', e);
  bridgeMsg((e && (e.code + ': ' + e.message)) || 'Bridge error', 'err');
});
bridge.connect().then(() => {
  notifyBridgeState();
  applyBridgeStatusToUI(bridge.getStatus());
}).catch(err => console.error('[Bridge connect failed]', err));

setInterval(() => {
    if (state.broadcastState === 'live') {
    state.timerSeconds = (state.timerSeconds || 0) + 1;
  }
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = formatTimer(state.timerSeconds || 0);
  if (Math.random() > 0.7) {
    state.viewerCount = Math.max(0, state.viewerCount + Math.floor(Math.random() * 5) - 2);
    if (state.viewerCount > (state.peakViewers || 0)) state.peakViewers = state.viewerCount;
    document.getElementById('viewers').textContent = state.viewerCount.toLocaleString();
  }
  if (!state.viewerHistory) state.viewerHistory = [];
  if (state.timerSeconds % 5 === 0) {
    state.viewerHistory.push(state.viewerCount);
    if (state.viewerHistory.length > 48) state.viewerHistory.shift();
  }
  if (state.currentView === 'home') renderHomeDashboard();
  if (state.currentView === 'analytics') renderAnalyticsPage();
  if (state.currentView === 'news') renderNewsDirectorPage();
    if (state.currentView === 'guests' && typeof refreshJoinInbox === 'function') refreshJoinInbox();
  if (!state.itemPaused && getPlayingItem()) {
    state.itemRemaining--;
    updateNewsDirectorUI();
    if (state.itemRemaining <= 0 && state.autoDirector) autoDirectorStep();
    else if (state.itemRemaining <= 0) state.itemRemaining = 0;
  }
  // Ad countdown (priority AD)
  if (state.media.recording) updateRecordingUI();
  if (state.activeAd && state.adRemaining > 0) {
    state.adRemaining--;
    const c1 = document.getElementById('ads-now-countdown');
    const c2 = document.getElementById('ad-overlay-count');
    if (c1) c1.textContent = formatDur(state.adRemaining);
    if (c2) c2.textContent = formatDur(state.adRemaining);
    const c3 = document.getElementById('ap-now-count');
    if (c3) c3.textContent = formatDur(state.adRemaining);
    if (state.adRemaining <= 0) {
      stopAd();
      if (state.autoDirector) autoDirectorStep();
    }
  }
}, 1000);

setInterval(tickAudioMeters, 120);

// Keyboard shortcuts (Studio operator) — bb-keyboard-shortcuts
document.addEventListener('keydown', function (e) {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key;
  if (key === 't' || key === 'T' || key === 'Enter') {
    e.preventDefault();
    if (typeof doTake === 'function') doTake();
  } else if (key === 'h' || key === 'H') {
    e.preventDefault();
    if (typeof doHold === 'function') doHold();
  } else if (key === 'b' || key === 'B') {
    e.preventDefault();
    if (typeof doBlack === 'function') doBlack();
  } else if (key === 'c' || key === 'C') {
    e.preventDefault();
    if (typeof doCut === 'function') doCut();
  } else if (key === 'f' || key === 'F') {
    e.preventDefault();
    if (typeof doFade === 'function') doFade();
  } else if (key === 'n' || key === 'N') {
    e.preventDefault();
    if (typeof rundownNext === 'function') rundownNext();
  } else if (key === 'e' || key === 'E') {
    // require shift for emergency to avoid accidents
    if (e.shiftKey) {
      e.preventDefault();
      if (typeof toggleEmergency === 'function') toggleEmergency();
    }
  } else if (key === '?' || (key === '/' && e.shiftKey)) {
    e.preventDefault();
    if (typeof toggleKeyboardHelp === 'function') toggleKeyboardHelp();
  } else if (key === 'Escape') {
    const help = document.getElementById('kb-help-modal');
    if (help && !help.classList.contains('hidden')) {
      e.preventDefault();
      toggleKeyboardHelp(false);
      return;
    }
    if (state.emergency && typeof clearEmergency === 'function') {
      e.preventDefault();
      clearEmergency();
    } else if (state.hold && typeof doHold === 'function') {
      e.preventDefault();
      doHold(); // toggle off
    }
  }
});

