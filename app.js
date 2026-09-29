// BROADCAST BRILLIANCE v2.6.0 — Side-by-side Preview|Program studio layout
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
  if (typeof can === 'function' && !can('broadcast')) {
    if (typeof pushNotification === 'function') pushNotification('RBAC', 'Broadcast start not allowed for role ' + currentRole(), 'warn');
    return;
  }
  // Allow recovery if stuck on STARTING
  if (state.broadcastState === 'live') return;
  if (state.broadcastState === 'starting') {
    // Force complete to LIVE
    state.broadcastState = 'live';
    updateBroadcastUI();
    if (typeof pushNotification === 'function') pushNotification('BROADCAST', 'Forced LIVE (was stuck STARTING)', 'ok');
    return;
  }
  state.broadcastState = 'starting';
  updateBroadcastUI();
  // Safety: never stay on STARTING more than 1.2s
  clearTimeout(window._bbStartTimer);
  window._bbStartTimer = setTimeout(function () {
    if (state.broadcastState === 'starting') {
      state.broadcastState = 'live';
      updateBroadcastUI();
    }
  }, 1200);
  audit('BROADCAST_START', 'Starting session');
  if (typeof pushNotification === 'function') pushNotification('BROADCAST', 'Starting…', 'info');
  setTimeout(function () {
    try {
      state.broadcastState = 'live';
      state.timerSeconds = 0;
      try { if (typeof requestBroadcastWakeLock === 'function') requestBroadcastWakeLock(); } catch (e) {}
      try { if (typeof setupMediaSession === 'function') setupMediaSession(); } catch (e) {}
      if (state.graphics && state.graphics.live) {
        state.graphics.live.enabled = true;
        try { if (typeof updateToggleUI === 'function') updateToggleUI('live'); } catch (e) {}
        try { if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram(); } catch (e) {}
      }
      try {
        if (!state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
      } catch (e) { console.warn('compositor', e); }
      if (state.settings && state.settings.autoRecordOnLive && !state.media.recording) {
        state._autoRecActive = true;
        try { if (typeof startLocalRecord === 'function') startLocalRecord(); } catch (e) { state._autoRecActive = false; }
      }
      try { if (typeof syncProgramMediaLayer === 'function') syncProgramMediaLayer(); } catch (e) {}
      try { if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher(true); } catch (e) {}
      updateBroadcastUI();
      const t = document.getElementById('timer');
      if (t) t.textContent = formatTimer(0);
      audit('BROADCAST_LIVE', 'Session live — Program on air (local)');
      if (typeof pushNotification === 'function') {
        pushNotification('BROADCAST', 'LIVE — Program on air', 'ok');
      }
      try { if (typeof notifyBridgeState === 'function') notifyBridgeState(); } catch (e) {}
      try {
        if (typeof enrichBridgeLocalStatus === 'function' && typeof bridge !== 'undefined' && bridge && bridge.lastStatus) {
          enrichBridgeLocalStatus(bridge.lastStatus);
          applyBridgeStatusToUI(bridge.lastStatus);
        }
      } catch (e) {}
    } catch (err) {
      console.error('startBroadcast complete failed', err);
      state.broadcastState = 'live';
      updateBroadcastUI();
      if (typeof pushNotification === 'function') pushNotification('BROADCAST', 'LIVE (recovered after error)', 'warn');
    }
  }, 400);
}

function stopBroadcast() {
  if (state.broadcastState !== 'live' && state.broadcastState !== 'starting') return;
  state.broadcastState = 'stopping';
  updateBroadcastUI();
  audit('BROADCAST_STOPPING', 'Stopping session');
  setTimeout(() => {
    if (state._autoRecActive && state.media && state.media.recording && typeof stopLocalRecord === 'function') {
      stopLocalRecord();
      state._autoRecActive = false;
    }
    state.broadcastState = 'ended';
    updateBroadcastUI();
    audit('BROADCAST_ENDED', 'Session ended · duration ' + formatTimer(state.timerSeconds || 0));
    if (typeof pushNotification === 'function') pushNotification('BROADCAST', 'Broadcast ended', 'info');
    if (typeof notifyBridgeState === 'function') notifyBridgeState();
  }, 400);
}


const state = {
  priority: 'PROGRAM', hold: false, transitioning: false, fadeDurationMs: 500, autoTransition: 'FADE', emergency: false, emergencyMode: null, emergencyMessage: 'Stand by for important information.', resumeSlots: null, resumePriority: 'PROGRAM', breaking: false, breakingText: '', breakingEndsAt: null, breakingTimer: null, breakingResumeSlots: null,
  broadcastState: 'offline', // offline | starting | live | stopping | ended
  timerSeconds: 0, viewerCount: 1248, peakViewers: 1248,
  viewerHistory: [1100,1120,1150,1180,1200,1220,1230,1240,1248],
  sessionTakes: 0,
  sourceTakeCounts: {},
  analyticsStartedAt: Date.now(),
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
    voiceOver: { live: false, stream: null, audioEl: null, level: 80, source: null },
    videoFilters: { brightness: 100, contrast: 100, hue: 0, smooth: 0 },
    voiceOver: { live: false, stream: null, audioEl: null, level: 80, source: null },
    videoFilters: { brightness: 100, contrast: 100, hue: 0, smooth: 0 },
    recording: false,
    mediaRecorder: null,
    recordedChunks: [],
    recStartedAt: null,
    animFrame: null,
  },
  recordings: [],

  graphics: {
    lt: {
      enabled: true,
      template: 'onair_green',
      title: 'GOVERNMENT UNVEILS NEW ECONOMIC PLAN',
      subtitle: 'Officials say the plan will create jobs, boost trade and drive growth',
      ribbon: 'BREAKING NEWS',
      tagline: 'Keeping you informed across Kenya',
      reporter: 'Jane Mwangi',
      reporterRole: 'CHIEF REPORTER',
      logoUrl: null,
      colors: {
        accent: '#dc2626',
        titleBg: '#ffffff',
        subBg: '#1e3a8a',
        tickerBg: '#0f172a',
        titleFg: '#0f172a',
        subFg: '#e2e8f0',
        badgeBg: '#16a34a',
        brandBg: '#000000'
      }
    },
    bn: { enabled: false, text: 'GOVERNMENT UNVEILS NEW ECONOMIC PLAN' },
    ticker: { enabled: true, text: 'KENYA SIGNS NEW TRADE DEAL WITH EU · SHILLING STRENGTHENS AGAINST DOLLAR · COUNTY GOVERNMENTS LAUNCH NEW INITIATIVES' },
    live: { enabled: true },
    clock: { enabled: true },
    logo: { enabled: true, text: 'NEWS ROOM TV' },
    loc: { enabled: true, text: 'Nairobi, Kenya' },
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
    bridgeStub: false,
    autoRecordOnLive: false,
    publicBaseUrl: '',
    financeApiUrl: 'http://localhost:8787',
    autoRecordOnLive: false,
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
    { id: 'viewer', label: 'Viewer', desc: 'Read-only monitoring' },
  ],

  audio: {
    duckAmount: 35,
    preDuckMaster: null,
    ducked: false,
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
  { id: 'admin-finance', label: 'Admin $', icon: '⚖' },
  { id: 'wallet', label: 'Wallet', icon: '💳' },
  { id: 'earnings', label: 'Earnings', icon: '↗' },
  { id: 'subscriptions', label: 'Plans', icon: '★' },
  { id: 'layouts', label: 'Layouts', icon: '▦' },
  { id: 'marketplace', label: 'Marketplace', icon: '🏷' },
  { id: 'watch', label: 'Watch', icon: '▶' },
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


// Client-side capability matrix (Module 14 lite — not real auth)
const ROLE_CAPS = {
  owner: ['*'],
  admin: ['*'],
  producer: ['take', 'hold', 'black', 'fade', 'rundown', 'sources', 'guests', 'graphics', 'ads', 'audio', 'record', 'broadcast', 'emergency'],
  director: ['take', 'hold', 'black', 'fade', 'rundown', 'sources', 'graphics', 'broadcast'],
  news_director: ['rundown', 'take', 'fade', 'sources'],
  graphics: ['graphics', 'take'],
  audio: ['audio'],
  guest_manager: ['guests'],
  viewer: []
};

function currentUser() {
  return (state.users || []).find(u => u.id === state.currentUserId) || (state.users || [])[0];
}

function currentRole() {
  const u = currentUser();
  return (u && u.role) || 'viewer';
}

function can(cap) {
  const role = currentRole();
  const list = ROLE_CAPS[role] || [];
  if (list.indexOf('*') >= 0) return true;
  return list.indexOf(cap) >= 0;
}

function assumeUser(id) {
  const u = (state.users || []).find(x => x.id === id);
  if (!u) return;
  state.currentUserId = id;
  applyRoleGates();
  if (typeof renderUsersPage === 'function') renderUsersPage();
  audit('USER_ASSUME', u.name + ' (' + u.role + ')');
  if (typeof pushNotification === 'function') pushNotification('USERS', 'Operating as ' + u.name + ' · ' + u.role, 'info');
}

function applyRoleGates() {
  const role = currentRole();
  const u = currentUser();
  const nameEl = document.querySelector('header .flex.items-center.gap-1\\.5.pl-2 span.font-medium, header span.text-\\[11px\\].font-medium');
  // Update header operator label if present
  try {
    const headerRight = document.querySelector('header .flex.items-center.gap-1\\.5.pl-2.border-l');
    if (headerRight) {
      const span = headerRight.querySelector('span.font-medium, span.text-\\[11px\\]');
      if (span && u) span.textContent = u.name;
      const av = headerRight.querySelector('.rounded-full');
      if (av && u) av.textContent = (u.name || '?').charAt(0).toUpperCase();
    }
  } catch (e) {}

  const setGate = (sel, cap) => {
    document.querySelectorAll(sel).forEach(el => {
      const ok = can(cap);
      if ('disabled' in el) el.disabled = !ok;
      el.classList.toggle('opacity-40', !ok);
      el.classList.toggle('pointer-events-none', !ok);
      if (!ok) el.setAttribute('title', 'Role ' + role + ' cannot ' + cap);
      else el.removeAttribute('title');
    });
  };
  setGate('button[onclick="doTake()"]', 'take');
  setGate('.btn-take', 'take');
  setGate('button[onclick="doCut()"]', 'take');
  setGate('button[onclick="doFade()"]', 'fade');
  setGate('#btn-fade', 'fade');
  setGate('button[onclick="doBlack()"]', 'black');
  setGate('button[onclick="doHold()"]', 'hold');
  setGate('button[onclick="doAutoTransition()"]', 'take');
  setGate('#btn-auto-trans', 'take');
  setGate('#btn-emergency', 'emergency');
  setGate('#btn-broadcast-start', 'broadcast');
  setGate('#btn-broadcast-stop', 'broadcast');
  setGate('#btn-rec', 'record');
  setGate('button[onclick="startLocalRecord()"]', 'record');
  setGate('button[onclick="stopLocalRecord()"]', 'record');
  setGate('button[onclick="startLocalCamera()"]', 'sources');
  setGate('#me-btn-cam', 'sources');

  const banner = document.getElementById('role-gate-banner');
  if (banner) {
    if (role === 'owner' || role === 'admin') banner.classList.add('hidden');
    else {
      banner.classList.remove('hidden');
      banner.textContent = 'Role gate active: ' + role + ' — some controls disabled (client-side only; not secure auth).';
    }
  }
  const me = document.getElementById('users-stat-me');
  if (me && u) me.textContent = u.name + ' · ' + u.role;
}


// ========== REAL MEDIA ENGINE ==========
async function startLocalCamera() {
  if (state.media.localStream) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: true
    });
    state.media.rawCameraStream = stream;
    let useStream = stream;
    if (state.audioDsp && state.audioDsp.enabled && typeof connectStreamToDsp === 'function') {
      try { useStream = connectStreamToDsp(stream, 'cam1') || stream; } catch (e) {}
    }
    state.media.localStream = useStream;
    const v = document.getElementById('local-cam-video');
    v.srcObject = stream; // video element keeps raw video; audio may be DSP-processed in localStream
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
    // Offer Virtual Studio controls after camera is live
    if (typeof openVStudioPanel === 'function') {
      try { openVStudioPanel(); } catch (e) {}
    }
  } catch (err) {
    console.error(err);
    alert('Camera access failed: ' + (err.message || err) + '\n\nAllow camera permission and use HTTPS or localhost.');
  }
}

function stopLocalCamera() {
  if (state.media.recording) stopLocalRecord();
  if (typeof stopVStudioLoop === 'function') stopVStudioLoop(true);
  if (state.media.rawCameraStream && state.media.rawCameraStream !== state.media.localStream) {
    try { state.media.rawCameraStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  }
  state.media.rawCameraStream = null;
  state.media.vstudioProcessed = false;
  state.media.vstudioVideo = null;
  if (state.vstudio) {
    state.vstudio.applied = false;
    state.vstudio.outputStream = null;
  }
  if (state.media.localStream) {
    state.media.localStream.getTracks().forEach(t => t.stop());
    state.media.localStream = null;
  }
  const v = document.getElementById('local-cam-video');
  if (v) v.srcObject = null;
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


function sizeMonitorFrames() {
  // Largest true 16:9 frame centered in each monitor (broadcast standard)
  ['preview-monitor', 'program-monitor'].forEach(mid => {
    const mon = document.getElementById(mid);
    const stage = document.querySelector('#' + mid + ' .monitor-stage');
    const frame = document.querySelector('#' + mid + ' .monitor-frame');
    if (!mon || !stage || !frame) return;
    const rw = mon.clientWidth;
    const rh = mon.clientHeight;
    if (rw < 32 || rh < 32) return;
    stage.style.width = '100%';
    stage.style.height = '100%';
    // Fit 16:9 inside the monitor box
    let w = rw;
    let h = w * 9 / 16;
    if (h > rh) {
      h = rh;
      w = h * 16 / 9;
    }
    w = Math.floor(w);
    h = Math.floor(h);
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
    frame.style.maxWidth = 'none';
    frame.style.maxHeight = 'none';
    frame.style.aspectRatio = '16 / 9';
  });
  // Canvas internal resolution matches the 16:9 program frame
  const frame = document.getElementById('program-frame');
  const canvas = document.getElementById('program-canvas');
  if (frame && canvas) {
    const w = Math.max(320, frame.clientWidth || 640);
    const h = Math.max(180, Math.round(w * 9 / 16));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
}

function resizeProgramCanvas() {
  const canvas = document.getElementById('program-canvas');
  const frame = document.getElementById('program-frame') || document.getElementById('program-monitor');
  if (!canvas || !frame) return;
  if (typeof sizeMonitorFrames === 'function') sizeMonitorFrames();
  if (typeof renderHardwareDevicePanels === 'function' && document.getElementById('hw-video-list')) renderHardwareDevicePanels();
  const rect = frame.getBoundingClientRect();
  let w = Math.max(320, Math.floor(rect.width) || 640);
  let h = Math.max(180, Math.round(w * 9 / 16));
  // Prefer frame height if already 16:9
  if (rect.height > 0) {
    const fromH = Math.floor(rect.height);
    const fromW = Math.round(fromH * 16 / 9);
    if (Math.abs(fromW - w) < 4) {
      w = fromW;
      h = fromH;
    }
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function startCompositor() {
  const canvas = document.getElementById('program-canvas');
  resizeProgramCanvas();
  if (!state.media._resizeObs) {
    state.media._resizeObs = new ResizeObserver(() => {
      if (typeof sizeMonitorFrames === 'function') sizeMonitorFrames();
  if (typeof renderHardwareDevicePanels === 'function' && document.getElementById('hw-video-list')) renderHardwareDevicePanels();
      resizeProgramCanvas();
    });
    const pf = document.getElementById('program-monitor');
    const pv = document.getElementById('preview-monitor');
    if (pf) state.media._resizeObs.observe(pf);
    if (pv) state.media._resizeObs.observe(pv);
  }
  state.media.compositorActive = true;
  if (typeof ensureDirectorBridge === 'function') ensureDirectorBridge();
  if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher();
  if (typeof enableBackgroundPlayback === 'function') enableBackgroundPlayback();
  try { bindProgramStreamToPipVideo(); } catch (e) {}
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
      // cover for broadcast fill (matches on-air look); contain only if slot is tiny
      const scale = (sw < 160 || sh < 90) ? Math.min(sw / vw, sh / vh) : Math.max(sw / vw, sh / vh);
      const dw = vw * scale, dh = vh * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, sw, sh);
      ctx.clip();
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, sw, sh);
      ctx.drawImage(video, x + (sw - dw) / 2, y + (sh - dh) / 2, dw, dh);
      ctx.restore();
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
    // Hardware camera by deviceId (multi-cam)
    if (src && src.type === 'camera' && src.deviceId && state.media.deviceStreams && state.media.deviceStreams[src.deviceId]) {
      let dv = document.getElementById('comp-dev-' + src.id);
      if (!dv) {
        dv = document.createElement('video');
        dv.id = 'comp-dev-' + src.id;
        dv.autoplay = true; dv.playsInline = true; dv.muted = true;
        dv.style.display = 'none';
        document.body.appendChild(dv);
      }
      if (dv.srcObject !== state.media.deviceStreams[src.deviceId]) {
        dv.srcObject = state.media.deviceStreams[src.deviceId];
        dv.play().catch(function () {});
      }
      drawVideoElement(dv, x, y, sw, sh, src);
    } else if (srcId === 'cam1' && state.media.vstudioProcessed && state.media.vstudioVideo) {
      drawVideoElement(state.media.vstudioVideo, x, y, sw, sh, src);
    } else if (srcId === 'cam1' && hasCam) {
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
          const scale = Math.min(sw / iw, sh / ih);
          const dw = iw * scale, dh = ih * scale;
          ctx.fillStyle = '#000';
          ctx.fillRect(x, y, sw, sh);
          ctx.drawImage(img, x + (sw - dw) / 2, y + (sh - dh) / 2, dw, dh);
        } catch (e) { fillPlaceholder(ctx, x, y, sw, sh, src); }
      } else {
        fillPlaceholder(ctx, x, y, sw, sh, src);
      }
    } else {
      fillPlaceholder(ctx, x, y, sw, sh, src);
    }
    // No chrome labels on Program pixels — only video + graphics overlays (HTML gfx layer)
  }

  function fillPlaceholder(ctx, x, y, sw, sh, src) {
    // Neutral black only — no PROGRAM / source chrome painted into Program pixels
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, sw, sh);
    if (src && src.type === 'youtube') {
      // YouTube is shown via HTML iframe layer (syncProgramMediaLayer), not canvas text
      return;
    }
  }

  // Bake programme video filters into canvas pixels (MediaRecorder + Watch)
  const vf = (state.media && state.media.videoFilters) || {};
  const b = (vf.brightness != null ? vf.brightness : 100) / 100;
  const c = (vf.contrast != null ? vf.contrast : 100) / 100;
  const hue = vf.hue != null ? vf.hue : 0;
  const sm = Number(vf.smooth) || 0;
  try {
    ctx.filter = 'brightness(' + b + ') contrast(' + c + ') hue-rotate(' + hue + 'deg) blur(' + (sm * 0.4) + 'px)';
  } catch (e) { ctx.filter = 'none'; }

  const layoutDef = LAYOUTS[layout];
  if (layoutDef && layoutDef.custom && layoutDef.regions && layoutDef.regions.length) {
    layoutDef.regions.forEach(function (reg, i) {
      const sid = (slots[i] != null ? slots[i] : reg.sourceId) || 'cam1';
      drawSlot(sid, Math.floor(reg.x * w), Math.floor(reg.y * h), Math.floor(reg.w * w), Math.floor(reg.h * h));
    });
  } else if (layout === 'fullscreen' || slots.length === 1) {
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

  // Program canvas stays clean — no PROGRAM/LIVE chrome painted into the video.
  // Lower thirds / LIVE / logo / clock are HTML graphics overlays only.
  try { ctx.filter = 'none'; } catch (e) {}

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
  // ALWAYS record PROGRAM only (program-canvas). Never Preview monitor.
  if (!state.media.compositorActive) startCompositor();
  const _pgmCanvas = document.getElementById('program-canvas');
  if (!_pgmCanvas) {
    if (typeof pushNotification === 'function') pushNotification('REC', 'Program canvas missing', 'error');
    return;
  }
  const canvas = document.getElementById('program-canvas');
  if (!canvas) {
    alert('Program canvas not available — cannot record Programme.');
    return;
  }
  let stream;
  try {
    stream = canvas.captureStream(30);
  } catch (e) {
    alert('Canvas capture not supported in this browser.');
    return;
  }
  // Mix in local / VO audio when present
  if (state.media.localStream) {
    state.media.localStream.getAudioTracks().forEach(t => {
      try { stream.addTrack(t); } catch (e) {}
    });
  }
  if (state.media.voiceOver && state.media.voiceOver.stream) {
    state.media.voiceOver.stream.getAudioTracks().forEach(t => {
      try { stream.addTrack(t); } catch (e) {}
    });
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
      url,
      markers: (state.media.recMarkers || []).slice()
    });
    state.media.recMarkers = [];
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
  state.media.recMarkers = [];
  state.media.mediaRecorder.start(1000);
  state.media.recording = true;
  document.getElementById('pipe-recorder').textContent = 'Recording';
  document.getElementById('pipe-recorder').className = 'text-red-400 font-semibold';
  document.getElementById('rec-indicator').textContent = '● REC';
  document.getElementById('rec-indicator').className = 'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border bg-red-600/20 border-red-500 text-red-400';
  document.getElementById('btn-rec').innerHTML = '<span>●</span> Stop Rec';
  document.getElementById('me-btn-rec').textContent = 'Stop Record';
  updateRecordingUI();
  audit('REC_START', 'Local recording: PROGRAM canvas only (not Preview)');
  if (typeof requestBroadcastWakeLock === 'function') requestBroadcastWakeLock();
  if (typeof setupMediaSession === 'function') setupMediaSession();
}

function stopLocalRecord() {
  if (state.media.mediaRecorder && state.media.recording) {
    state.media.mediaRecorder.stop();
  }
  state.media.recording = false;
  if (typeof releaseBroadcastWakeLock === 'function' && state.broadcastState !== 'live') releaseBroadcastWakeLock();
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
    const marks = (r.markers && r.markers.length) ? (r.markers.length + ' marks') : '—';
    const when = new Date(r.startedAt).toLocaleString();
    return '<tr class="border-t border-[#1e2a3a]/60 hover:bg-[#131a28]">' +
      '<td class="px-3 py-2 text-white font-medium">' + r.name + '</td>' +
      '<td class="px-2 py-2 text-slate-400">' + when + '</td>' +
      '<td class="px-2 py-2 font-mono text-slate-300">' + formatDur(r.durationSec || 0) + '</td>' +
      '<td class="px-2 py-2 text-slate-300">' + formatBytes(r.sizeBytes) + '</td>' +
      '<td class="px-2 py-2 text-slate-500">' + (r.type || 'local') + (marks !== '—' ? (' · <span class="text-rose-300">' + marks + '</span>') : '') + '</td>' +
      '<td class="px-2 py-2">' +
        '<div class="flex flex-wrap gap-1">' +
          '<button onclick="downloadRecording(\'' + r.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-800 text-white">Download</button>' +
          ((r.markers && r.markers.length) ? '<button onclick="exportRecordingMarkers(\'' + r.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-rose-900 text-rose-100">Markers CSV</button>' : '') +
          ((r.markers && r.markers.length) ? '<button onclick="toggleRecordingMarkers(\'' + r.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Marks</button>' : '') +
          '<button onclick="deleteRecording(\'' + r.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Remove</button>' +
        '</div>' +
        '<div id="rec-marks-' + r.id + '" class="hidden mt-1 text-[9px] text-slate-400 font-mono space-y-0.5"></div>' +
        '</td></tr>';
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
    return '<div class="layout-grid cols-2">' + used.map((id,i) => renderTile(getSource(id), isProgram, i)).join('') + '</div>';
  }
  if (state.layout === '2x2') {
    return '<div class="layout-grid cols-2 rows-2">' + used.map((id,i) => renderTile(getSource(id), isProgram, i)).join('') + '</div>';
  }
  if (state.layout === 'pip') {
    const main = getSource(used[0] || 'cam1'), pip = getSource(used[1] || 'guest1');
    return '<div class="relative h-full w-full">' + renderTile(main, isProgram, 0, true) +
      '<div class="absolute bottom-[10%] right-[2.5%] w-[28%] h-[28%] rounded border-2 border-white/80 overflow-hidden shadow-lg z-10">' + renderTile(pip, isProgram, 1, true) + '</div></div>';
  }
  return renderTile(getSource(used[0]), isProgram, 0, true);
}

function renderTile(src, isProgram, slotIndex, full) {
  src = src || { id: '?', name: 'Empty', color: '#1e293b', icon: '•' };
  const selected = !isProgram && state.selectedSlot === slotIndex;
  const box = 'tile ' + (full ? 'h-full w-full' : '') + ' ' + (selected ? 'slot-selected' : '') + ' cursor-pointer';
  const click = isProgram ? '' : 'selectSlot(' + slotIndex + ')';
  const srcLabel = src.name || '';
  const label = '<div class="tile-label">' + srcLabel + '</div>';

  if (src.id === 'cam1' && state.media && state.media.localStream) {
    return '<div class="' + box + '" onclick="' + click + '">' +
      '<video class="media-tile" autoplay playsinline muted data-mirror="1"></video>' +
      '<div class="absolute bottom-1 right-1 text-[8px] px-1 rounded bg-black/55 text-green-300 z-[2]">LIVE CAM</div>' + label + '</div>';
  }
  if (src.id === 'screen1' && state.media && state.media.screenStream) {
    return '<div class="' + box + '" onclick="' + click + '">' +
      '<video class="media-tile" autoplay playsinline muted data-screen="1"></video>' + label + '</div>';
  }
  if (src.type === 'media' && src.mediaUrl) {
    return '<div class="' + box + '" onclick="' + click + '">' +
      '<video class="media-tile" src="' + src.mediaUrl + '" autoplay muted loop playsinline></video>' + label + '</div>';
  }
  if (src.type === 'image' && src.imageUrl) {
    return '<div class="' + box + '" onclick="' + click + '">' +
      '<img class="media-tile" src="' + src.imageUrl + '" alt="" />' + label + '</div>';
  }
  if (src.type === 'youtube' && src.youtubeId) {
    return '<div class="' + box + '" onclick="' + click + '">' +
      '<iframe class="media-tile" src="https://www.youtube.com/embed/' + src.youtubeId + '?autoplay=1&mute=1&controls=0&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>' +
      label + '</div>';
  }
  return '<div class="' + box + '" onclick="' + click + '" style="background: linear-gradient(145deg, ' + (src.color || '#1e293b') + 'dd, #0f172a 85%);">' +
    '<div class="absolute inset-0 flex flex-col items-center justify-center"><div class="text-2xl mb-1">' + (src.icon || '•') + '</div><div class="text-[11px] font-bold text-white text-center px-1 leading-tight">' + (src.name || '') + '</div><div class="text-[9px] text-slate-300">' + (src.res || '') + '</div></div>' +
    label + '</div>';
}

function attachPreviewVideos() {
  document.querySelectorAll('#preview-content video[data-mirror]').forEach(v => {
    if (state.media && state.media.localStream && v.srcObject !== state.media.localStream) {
      v.srcObject = state.media.localStream;
      v.play().catch(() => {});
    }
  });
  document.querySelectorAll('#preview-content video[data-screen]').forEach(v => {
    if (state.media && state.media.screenStream && v.srcObject !== state.media.screenStream) {
      v.srcObject = state.media.screenStream;
      v.play().catch(() => {});
    }
  });
}

function renderPreview() {
  if (typeof renderMobileSourceStrip === 'function') {
    try { renderMobileSourceStrip(); } catch (e) {}
  }

  const el = document.getElementById('preview-content');
  if (el) el.innerHTML = buildLayoutHTML(state.previewSlots, false);
  const lab = document.getElementById('preview-layout-label');
  if (lab) lab.textContent = LAYOUTS[state.layout].name;
  attachPreviewVideos();
  if (typeof sizeMonitorFrames === 'function') sizeMonitorFrames();
  if (typeof renderHardwareDevicePanels === 'function' && document.getElementById('hw-video-list')) renderHardwareDevicePanels();
}

function programPrimarySource() {
  const slots = state.programSlots || [];
  return getSource(slots[0] || 'cam1');
}

function syncProgramMediaLayer() {
  // Program picture: real video when possible. YouTube cannot be drawn to canvas (CORS),
  // so primary YouTube uses an HTML iframe under graphics — even if layout was 2x2.
  const el = document.getElementById('program-content');
  const canvas = document.getElementById('program-canvas');
  if (!el) return;
  if (state.priority === 'EMERGENCY') return;

  const src = (typeof programPrimarySource === 'function') ? programPrimarySource() : null;
  // Also scan program slots for first YouTube with id
  let ytSrc = (src && src.type === 'youtube' && src.youtubeId) ? src : null;
  if (!ytSrc && state.programSlots) {
    for (let i = 0; i < state.programSlots.length; i++) {
      const s = typeof getSource === 'function' ? getSource(state.programSlots[i]) : null;
      if (s && s.type === 'youtube' && s.youtubeId) { ytSrc = s; break; }
    }
  }

  if (ytSrc && ytSrc.youtubeId) {
    if (canvas) {
      canvas.style.opacity = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.visibility = 'hidden';
    }
    el.style.display = 'block';
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.zIndex = '2';
    el.style.pointerEvents = 'auto';
    el.style.overflow = 'hidden';
    el.style.background = '#000';
    const yid = ytSrc.youtubeId;
    const muted = (state.media.programMuted !== false); // default mute for autoplay policy
    const vol = Math.max(0, Math.min(100, state.media.programVolume != null ? state.media.programVolume : 80));
    const want = 'yt:' + yid + ':' + (muted ? 'm' : 'u') + ':' + vol;
    if (el.dataset.bbLayer !== want) {
      el.dataset.bbLayer = want;
      const muteParam = muted ? '1' : '0';
      el.innerHTML = '<iframe id="program-yt-iframe" class="media-tile" src="https://www.youtube.com/embed/' + yid +
        '?autoplay=1&mute=' + muteParam + '&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1" allow="autoplay; encrypted-media; picture-in-picture" ' +
        'style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#000" title="Program YouTube"></iframe>';
      // After load, set volume via API
      setTimeout(function () { applyProgramMediaVolume(); }, 600);
    } else {
      applyProgramMediaVolume();
    }
    return;
  }

  // Uploaded media / image as primary — HTML layer (reliable play + volume)
  let mediaSrc = (src && src.type === 'media' && src.mediaUrl) ? src : null;
  let imageSrc = (src && src.type === 'image' && src.imageUrl) ? src : null;
  if (!mediaSrc && state.programSlots) {
    for (let i = 0; i < state.programSlots.length; i++) {
      const s = typeof getSource === 'function' ? getSource(state.programSlots[i]) : null;
      if (s && s.type === 'media' && s.mediaUrl) { mediaSrc = s; break; }
    }
  }
  if (mediaSrc && mediaSrc.mediaUrl && (state.layout === 'fullscreen' || (state.programSlots || []).length <= 1)) {
    if (canvas) {
      canvas.style.opacity = '0';
      canvas.style.visibility = 'hidden';
      canvas.style.pointerEvents = 'none';
    }
    el.style.display = 'block';
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.zIndex = '2';
    el.style.pointerEvents = 'auto';
    el.style.overflow = 'hidden';
    el.style.background = '#000';
    const muted = !!state.media.programMuted;
    const vol = Math.max(0, Math.min(100, state.media.programVolume != null ? state.media.programVolume : 80));
    const want = 'media:' + mediaSrc.id + ':' + (muted ? 'm' : 'u');
    if (el.dataset.bbLayer !== want) {
      el.dataset.bbLayer = want;
      el.innerHTML = '<video id="program-media-video" class="media-tile" src="' + mediaSrc.mediaUrl +
        '" autoplay loop playsinline ' + (muted ? 'muted' : '') +
        ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000"></video>';
      const v = document.getElementById('program-media-video');
      if (v) {
        v.volume = muted ? 0 : (vol / 100);
        v.play().catch(function () {});
      }
    } else {
      const v = document.getElementById('program-media-video');
      if (v) {
        v.muted = muted;
        v.volume = muted ? 0 : (vol / 100);
        if (v.paused) v.play().catch(function () {});
      }
    }
    return;
  }
  if (imageSrc && imageSrc.imageUrl && (state.layout === 'fullscreen' || (state.programSlots || []).length <= 1)) {
    if (canvas) {
      canvas.style.opacity = '0';
      canvas.style.visibility = 'hidden';
      canvas.style.pointerEvents = 'none';
    }
    el.style.display = 'block';
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.zIndex = '2';
    el.style.overflow = 'hidden';
    el.style.background = '#000';
    const want = 'img:' + imageSrc.id;
    if (el.dataset.bbLayer !== want) {
      el.dataset.bbLayer = want;
      el.innerHTML = '<img id="program-still-img" src="' + imageSrc.imageUrl +
        '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000" />';
    }
    return;
  }

  if (canvas) {
    canvas.style.opacity = '1';
    canvas.style.visibility = 'visible';
    canvas.style.pointerEvents = 'none';
  }
  el.style.zIndex = '1';
  el.style.pointerEvents = 'none';
  // Canvas owns pixels for cam / screen / multiview — clear HTML media layer
  if (el.dataset.bbLayer !== 'canvas') {
    el.dataset.bbLayer = 'canvas';
    el.innerHTML = '';
  }
  if (!state.media.compositorActive && typeof startCompositor === 'function') {
    startCompositor();
  }
}

function renderProgram() {
  if (state.priority === 'EMERGENCY') return;
  syncProgramMediaLayer();
  const lab = document.getElementById('program-layout-label');
  if (lab) lab.textContent = (LAYOUTS[state.layout] && LAYOUTS[state.layout].name) || state.layout;
  applyGraphicsToProgram();
  updateProgramEngineUI();
  if (typeof sizeMonitorFrames === 'function') sizeMonitorFrames();
  if (typeof renderHardwareDevicePanels === 'function' && document.getElementById('hw-video-list')) renderHardwareDevicePanels();
  if (typeof resizeProgramCanvas === 'function') resizeProgramCanvas();
  // Keep Watch viewers in sync
  if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher();
}

// ========== SWITCHER / ACTIONS ==========
function selectSource(id) {
  // mobile strip refresh after selection

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


function fillAnalyticsExtended() {
  const srcBox = document.getElementById('an-sources');
  if (srcBox) {
    const counts = state.sourceTakeCounts || {};
    const rows = Object.keys(counts).map(function (id) {
      const s = (typeof getSource === 'function') ? getSource(id) : null;
      return { id: id, name: (s && s.name) || id, n: counts[id], type: (s && s.type) || '—' };
    }).sort(function (a, b) { return b.n - a.n; });
    if (!rows.length) {
      srcBox.innerHTML = '<div class="text-slate-500">No TAKEs yet this session</div>';
    } else {
      const maxN = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
      srcBox.innerHTML = rows.map(function (r) {
        const pct = Math.round((r.n / maxN) * 100);
        return '<div class="mb-1.5"><div class="flex justify-between text-slate-300 mb-0.5"><span>' + r.name + ' <span class="text-slate-600">(' + r.type + ')</span></span><span class="text-cyan-300">' + r.n + '</span></div><div class="h-1.5 rounded bg-[#131a28] overflow-hidden"><div class="h-full bg-cyan-700" style="width:' + pct + '%"></div></div></div>';
      }).join('');
    }
  }
  const watchBox = document.getElementById('an-watch');
  const watchN = document.getElementById('an-watch-n');
  let watchActive = 0;
  try {
    const j = JSON.parse(localStorage.getItem('bb_watch_viewer') || 'null');
    if (j && j.at && (Date.now() - j.at < 15000)) watchActive = 1;
  } catch (e) {}
  if (state._watchViewerAt && (Date.now() - state._watchViewerAt < 15000)) watchActive = Math.max(watchActive, 1);
  if (watchN) watchN.textContent = watchActive + ' active';
  if (watchBox) {
    watchBox.innerHTML =
      '<div class="flex justify-between px-2 py-1 rounded bg-[#131a28]"><span class="text-slate-400">Watch tabs (recent ping)</span><span class="text-slate-200">' + watchActive + '</span></div>' +
      '<div class="flex justify-between px-2 py-1 rounded bg-[#131a28]"><span class="text-slate-400">Demo audience counter</span><span class="text-slate-200">' + (state.viewerCount || 0).toLocaleString() + '</span></div>' +
      '<div class="flex justify-between px-2 py-1 rounded bg-[#131a28]"><span class="text-slate-400">Peak (session)</span><span class="text-slate-200">' + (state.peakViewers || 0).toLocaleString() + '</span></div>' +
      '<p class="text-[9px] text-amber-500/90 mt-1">Demo audience until destination APIs connect. Watch presence is same-origin only.</p>';
  }
  const act = document.getElementById('an-activity');
  if (act) {
    const log = (state.auditLog || []).slice(0, 40);
    if (!log.length) act.innerHTML = '<div class="text-slate-500 px-1 py-2">No operator actions yet</div>';
    else act.innerHTML = log.map(function (e) {
      return '<div class="flex gap-2 px-1 py-0.5 border-t border-[#1e2a3a]/40"><span class="text-slate-500 w-14 shrink-0">' + (e.time || '') + '</span><span class="text-cyan-300/90 w-24 shrink-0 truncate">' + (e.action || '') + '</span><span class="text-slate-300 flex-1 truncate">' + (e.detail || '') + '</span></div>';
    }).join('');
  }
}

function exportAnalyticsReport() {
  const lines = [];
  lines.push('Broadcast Brilliance — Session Analytics');
  lines.push('Exported,' + new Date().toISOString());
  lines.push('Broadcast state,' + (state.broadcastState || ''));
  lines.push('Timer seconds,' + (state.timerSeconds || 0));
  lines.push('Session TAKEs,' + (state.sessionTakes || 0));
  lines.push('Priority,' + (state.priority || ''));
  lines.push('Layout,' + (state.layout || ''));
  lines.push('Program slots,' + (state.programSlots || []).join('|'));
  lines.push('Demo viewers,' + (state.viewerCount || 0));
  lines.push('Peak viewers,' + (state.peakViewers || 0));
  lines.push('Recordings,' + ((state.recordings || []).length));
  lines.push('');
  lines.push('Source,Type,TAKEs');
  const counts = state.sourceTakeCounts || {};
  Object.keys(counts).forEach(function (id) {
    const s = (typeof getSource === 'function') ? getSource(id) : null;
    lines.push('"' + String((s && s.name) || id).replace(/"/g, '') + '",' + ((s && s.type) || '') + ',' + counts[id]);
  });
  lines.push('');
  lines.push('Time,Action,Detail,User');
  (state.auditLog || []).forEach(function (e) {
    lines.push([e.time || '', e.action || '', '"' + String(e.detail || '').replace(/"/g, '') + '"', e.user || ''].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bb-analytics-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
  a.click();
  try { URL.revokeObjectURL(url); } catch (e) {}
  if (typeof audit === 'function') audit('ANALYTICS_EXPORT', 'CSV');
  if (typeof pushNotification === 'function') pushNotification('Analytics', 'Session report exported', 'ok');
}
window.exportAnalyticsReport = exportAnalyticsReport;

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
  if (typeof setSwitcherStatus === 'function') setSwitcherStatus('CUT', 'ok');

  completeTake({ type: 'CUT', durationMs: 0 });
}

function setAutoTransition(mode) {
  state.autoTransition = (mode === 'FADE') ? 'FADE' : 'CUT';
  const el = document.getElementById('auto-transition');
  if (el) el.value = state.autoTransition;
  audit('TRANS_MODE', state.autoTransition);
}

function takePreferred() {
  if (state.autoTransition === 'FADE') doFade();
  else doTake();
}

function doAutoTransition() {
  // Explicit AUTO button — uses preferred transition
  takePreferred();
}

function getFadeDurationMs() {
  const el = document.getElementById('fade-duration');
  if (el) {
    const n = parseInt(el.value, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return state.fadeDurationMs || 500;
}

function addRecordingMarker(label, detail) {
  if (!state.media || !state.media.recording || !state.media.recStartedAt) return;
  const t = Math.max(0, (Date.now() - state.media.recStartedAt) / 1000);
  state.media.recMarkers = state.media.recMarkers || [];
  state.media.recMarkers.push({
    t: Math.round(t * 10) / 10,
    label: label || 'MARK',
    detail: detail || '',
    at: Date.now()
  });
  const el = document.getElementById('rec-marker-count');
  if (el) el.textContent = state.media.recMarkers.length + ' marks';
}

function completeTake(transition) {
  state.sourceTakeCounts = state.sourceTakeCounts || {};
  (state.programSlots || []).forEach(function (sid) {
    if (!sid) return;
    state.sourceTakeCounts[sid] = (state.sourceTakeCounts[sid] || 0) + 1;
  });

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
  if (typeof setSwitcherStatus === 'function') setSwitcherStatus('ON PROGRAM', 'ok');
  if (typeof addRecordingMarker === 'function') {
    const tr = (transition && transition.type) || 'TAKE';
    const src = (state.programSlots && state.programSlots[0]) || '';
    addRecordingMarker(tr, src);
  }
  if (typeof multiOpBroadcast === 'function') {
    multiOpBroadcast('take', { programSlots: state.programSlots, transition: transition });
  }
  try { if (typeof renderProgram === 'function') renderProgram(); } catch (e) {}
  try { if (typeof syncProgramMediaLayer === 'function') syncProgramMediaLayer(); } catch (e) {}
  try { if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher(true); } catch (e) {}
  try { if (typeof applyProgramMediaVolume === 'function') applyProgramMediaVolume(); } catch (e) {}
  if (typeof syncProgramMediaLayer === 'function') syncProgramMediaLayer();
  if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher(true);
  if (typeof publishDirectorState === 'function') { try { publishDirectorState(); } catch (e) {} }
  state.sourceTakeCounts = state.sourceTakeCounts || {};
  (state.programSlots || []).forEach(function (sid) {
    if (!sid) return;
    state.sourceTakeCounts[sid] = (state.sourceTakeCounts[sid] || 0) + 1;
  });
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
  if (typeof setSwitcherStatus === 'function') setSwitcherStatus('TAKE', 'ok');

  if (typeof can === 'function' && !can('take')) {
    if (typeof pushNotification === 'function') pushNotification('RBAC', 'TAKE not allowed for role ' + currentRole(), 'warn');
    return;
  }
  if (state.transitioning) return;
  completeTake({ type: 'CUT', durationMs: 0 });
}

function doFade() {
  const _fd = state.fadeDurationMs || 500;
  setSwitcherStatus('FADING ' + (_fd / 1000) + 's…', 'busy');
  setTimeout(function () { if (typeof setSwitcherStatus === 'function') setSwitcherStatus('Ready', 'ok'); }, _fd + 50);

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
  if (state.priority === 'EMERGENCY') {
    if (typeof pushNotification === 'function') pushNotification('BLACK', 'Use RESUME on emergency first', 'warn');
    return;
  }
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
(function(){ const el=document.getElementById('auto-transition'); if(el) el.value=state.autoTransition||'FADE'; })();
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
  // Stop ads under emergency (priority: EMERGENCY > BREAKING > AD > PROGRAM)
  if (state.activeAd && typeof stopAd === 'function') {
    try { stopAd(); } catch (e) {}
  }
  setPriority('EMERGENCY');
  const overlay = document.getElementById('emergency-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    // BLACK = solid black (minimal chrome); MESSAGE/FULL = message panel
    if (mode === 'black') {
      overlay.innerHTML = '<div class="absolute inset-0 bg-black"></div>' +
        '<button type="button" onclick="clearEmergency()" class="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded bg-green-700 text-white text-[11px] font-semibold z-10">RESUME PROGRAM</button>';
    } else {
      overlay.innerHTML = '<div class="text-center px-6 max-w-lg"><div class="text-red-500 text-3xl font-black tracking-widest">EMERGENCY</div>' +
        '<div id="emergency-mode-label" class="text-[11px] text-red-400/80 mt-1 uppercase tracking-wider">' +
        (mode === 'message' ? 'Message takeover' : 'Full takeover') + '</div>' +
        '<div id="emergency-message" class="text-white text-base font-semibold mt-3 leading-snug">' + msg + '</div>' +
        '<button type="button" onclick="clearEmergency()" class="mt-5 px-4 py-1.5 rounded bg-green-700 text-white text-[11px] font-semibold">RESUME PROGRAM</button></div>';
    }
  }
  // Hide program media under emergency
  const canvas = document.getElementById('program-canvas');
  const pc = document.getElementById('program-content');
  if (canvas) { canvas.style.visibility = 'hidden'; }
  if (pc) { pc.style.visibility = 'hidden'; }
  const br = document.getElementById('breaking-overlay');
  if (br) br.classList.add('hidden');
  const btn = document.getElementById('btn-emergency');
  if (btn) btn.classList.add('ring-2', 'ring-red-400');
  updateProgramEngineUI();
  if (typeof notifyBridgeState === 'function') notifyBridgeState();
  if (typeof multiOpBroadcast === 'function') {
    multiOpBroadcast('emergency', { on: true, mode: mode, message: msg });
  }
  if (typeof pushNotification === 'function') {
    pushNotification('EMERGENCY', (mode + '').toUpperCase() + ' — Program takeover', 'error');
  }
  audit('EMERGENCY_ON', mode + ': ' + msg);
}

function clearEmergency() {
  state.emergency = false;
  state.emergencyMode = null;
  const overlay = document.getElementById('emergency-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    // restore default markup for next activation
    overlay.innerHTML = '<div class="text-center px-6 max-w-lg"><div class="text-red-500 text-3xl font-black tracking-widest">EMERGENCY</div><div id="emergency-mode-label" class="text-[11px] text-red-400/80 mt-1 uppercase tracking-wider">Full takeover</div><div id="emergency-message" class="text-white text-base font-semibold mt-3 leading-snug">Stand by for important information.</div><button type="button" onclick="clearEmergency()" class="mt-5 px-4 py-1.5 rounded bg-green-700 text-white text-[11px] font-semibold">RESUME PROGRAM</button></div>';
  }
  const canvas = document.getElementById('program-canvas');
  const pc = document.getElementById('program-content');
  if (canvas) { canvas.style.visibility = 'visible'; }
  if (pc) { pc.style.visibility = 'visible'; }
  if (state.resumeSlots) {
    state.programSlots = state.resumeSlots;
    state.resumeSlots = null;
  }
  const p = state.breaking ? 'BREAKING' : (state.resumePriority || 'PROGRAM');
  setPriority(p);
  if (state.media && !state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
  try { if (typeof syncProgramMediaLayer === 'function') syncProgramMediaLayer(); } catch (e) {}
  renderProgram();
  const btn = document.getElementById('btn-emergency');
  if (btn) btn.classList.remove('ring-2', 'ring-red-400');
  updateProgramEngineUI();
  if (typeof notifyBridgeState === 'function') notifyBridgeState();
  if (typeof multiOpBroadcast === 'function') {
    multiOpBroadcast('emergency', { on: false });
  }
  if (typeof pushNotification === 'function') {
    pushNotification('EMERGENCY', 'Program resumed', 'ok');
  }
  audit('EMERGENCY_OFF', 'Resumed previous program');
}

function toggleEmergency() {
  if (typeof can === 'function' && !can('emergency')) {
    if (typeof pushNotification === 'function') pushNotification('RBAC', 'Emergency not allowed for role ' + currentRole(), 'warn');
    return;
  }
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

function saveRundownToStorage() {
  try {
    const payload = {
      rundown: state.rundown.map(r => ({
        n: r.n, type: r.type, title: r.title, dur: r.dur, durSec: r.durSec,
        status: r.status, source: r.source, notes: r.notes || '', adId: r.adId || null
      })),
      itemRemaining: state.itemRemaining,
      itemPaused: !!state.itemPaused
    };
    localStorage.setItem('bb_rundown', JSON.stringify(payload));
    if (typeof pushNotification === 'function') pushNotification('RUNDOWN', 'Rundown saved', 'ok');
    audit('RUNDOWN_SAVE', state.rundown.length + ' items');
  } catch (e) {
    if (typeof pushNotification === 'function') pushNotification('RUNDOWN', 'Could not save rundown', 'error');
  }
}

function loadRundownFromStorage() {
  try {
    const raw = localStorage.getItem('bb_rundown');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rundown) || !data.rundown.length) return false;
    state.rundown = data.rundown.map((r, i) => ({
      n: r.n != null ? r.n : (i + 1),
      type: r.type || 'Video',
      title: r.title || ('Item ' + (i + 1)),
      dur: r.dur || '01:00',
      durSec: r.durSec != null ? r.durSec : parseDur(r.dur || '01:00'),
      status: r.status || 'Upcoming',
      source: r.source || 'Camera 1',
      notes: r.notes || '',
      adId: r.adId || null
    }));
    if (typeof data.itemRemaining === 'number') state.itemRemaining = data.itemRemaining;
    state.itemPaused = !!data.itemPaused;
    return true;
  } catch (e) {
    return false;
  }
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
      takePreferred();
      setPriority('AD');
    }
    return;
  }
  // Leaving an ad via rundown advance
  if (state.activeAd) stopAd();
  if (item.type === 'Guest') { setLayout('host-guest'); state.previewSlots = ['cam1', srcId]; }
  else if (/opening|closing/i.test(item.title) || item.type === 'Open' || item.type === 'Close') { setLayout('fullscreen'); state.previewSlots = [srcId]; }
  else { state.previewSlots[0] = srcId; }
  renderPreview();
  takePreferred();
  applyAutoDirectorCues(item);
  state.itemRemaining = item.durSec; state.itemPaused = false;
  item.status = 'Playing';
  updateNewsDirectorUI(); renderRundownTable();
  if (typeof setSwitcherStatus === 'function') setSwitcherStatus('AUTO: ' + (item.title || '').slice(0, 24), 'busy');
  if (typeof pushNotification === 'function' && state.autoDirector) {
    pushNotification('AUTO', 'Now: ' + item.title + ' (' + (item.dur || '') + ')', 'info');
  }
  if (typeof saveRundownToStorage === 'function') {
    try { /* quiet auto-save of status */ 
      const payload = { rundown: state.rundown, itemRemaining: state.itemRemaining, itemPaused: !!state.itemPaused };
      localStorage.setItem('bb_rundown', JSON.stringify({
        rundown: state.rundown.map(function (r) {
          return { n: r.n, type: r.type, title: r.title, dur: r.dur, durSec: r.durSec, status: r.status, source: r.source, notes: r.notes || '', adId: r.adId || null };
        }),
        itemRemaining: state.itemRemaining,
        itemPaused: !!state.itemPaused
      }));
    } catch (e) {}
  }
}

function applyAutoDirectorCues(item) {
  if (!item || !state.graphics) return;
  const notes = String(item.notes || '').toLowerCase();
  const title = String(item.title || '');
  const type = String(item.type || '');

  // Default LT title from rundown item
  if (state.graphics.lt) {
    state.graphics.lt.title = title.slice(0, 48) || state.graphics.lt.title;
    if (item.notes && !/^gfx:/i.test(item.notes)) {
      state.graphics.lt.subtitle = String(item.notes).slice(0, 64);
    }
  }

  // Type-based graphics
  if (/opening/i.test(title) || type === 'Open') {
    if (state.graphics.live) state.graphics.live.on = true;
    if (state.graphics.logo) state.graphics.logo.on = true;
    if (state.graphics.lt) state.graphics.lt.on = true;
  } else if (/closing/i.test(title) || type === 'Close') {
    if (state.graphics.lt) state.graphics.lt.on = true;
    if (state.graphics.ticker) state.graphics.ticker.on = false;
  } else if (type === 'Guest' || /guest|interview/i.test(title)) {
    if (state.graphics.lt) state.graphics.lt.on = true;
    if (state.graphics.live) state.graphics.live.on = true;
  } else if (/weather/i.test(title) || type === 'Weather') {
    if (state.graphics.loc) state.graphics.loc.on = true;
    if (state.graphics.lt) state.graphics.lt.on = true;
  } else if (/sport/i.test(title) || type === 'Sports') {
    if (state.graphics.lt) {
      state.graphics.lt.on = true;
      if (typeof selectLtTemplate === 'function') selectLtTemplate('sports_bar');
    }
  } else if (/break|bulletin/i.test(title)) {
    if (typeof triggerBreaking === 'function' && notes.indexOf('nobreak') < 0) {
      // only if notes request breaking
      if (notes.indexOf('breaking') >= 0) triggerBreaking(title);
    }
  }

  // Explicit notes cues: gfx:lt=on gfx:live=off gfx:ticker=on gfx:clear
  if (notes.indexOf('gfx:clear') >= 0) {
    ['lt', 'live', 'logo', 'loc', 'ticker', 'clock', 'breaking'].forEach(function (k) {
      if (state.graphics[k]) state.graphics[k].on = false;
    });
  }
  ['lt', 'live', 'logo', 'loc', 'ticker', 'clock'].forEach(function (k) {
    if (notes.indexOf('gfx:' + k + '=on') >= 0 && state.graphics[k]) state.graphics[k].on = true;
    if (notes.indexOf('gfx:' + k + '=off') >= 0 && state.graphics[k]) state.graphics[k].on = false;
  });

  if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram();
  if (typeof syncGfxEditors === 'function') syncGfxEditors();
  if (typeof renderGraphicsPage === 'function' && state.currentView === 'graphics') renderGraphicsPage();
}

function rundownPrev() {
  if (state.emergency || state.priority === 'EMERGENCY') {
    if (typeof pushNotification === 'function') pushNotification('RUNDOWN', 'Blocked during emergency', 'warn');
    return;
  }
  const playingIdx = state.rundown.findIndex(function (r) { return r.status === 'Playing' || r.status === 'Paused'; });
  let target = playingIdx > 0 ? playingIdx - 1 : -1;
  if (target < 0) {
    // last completed
    for (let i = state.rundown.length - 1; i >= 0; i--) {
      if (state.rundown[i].status === 'Completed') { target = i; break; }
    }
  }
  if (target < 0) {
    if (typeof pushNotification === 'function') pushNotification('RUNDOWN', 'No previous item', 'warn');
    return;
  }
  if (typeof jumpToRundownItem === 'function') jumpToRundownItem(target);
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
    if (typeof saveRundownToStorage === 'function') saveRundownToStorage();
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
  const set = (id, val) => { const el = document.getElementById(id); if (el && document.activeElement !== el && el.value !== (val || '')) el.value = val || ''; };
  set('gfx-edit-lt-title', g.lt.title);
  set('gfx-edit-lt-sub', g.lt.subtitle);
  set('gfx-edit-bn', g.bn && g.bn.text);
  set('gfx-edit-ticker', g.ticker && g.ticker.text);
  set('gfx-edit-loc', g.loc && g.loc.text);
  set('gfx-edit-logo', g.logo && g.logo.text);
  set('gp-lt-title', g.lt.title);
  set('gp-lt-sub', g.lt.subtitle);
  set('gp-lt-ribbon', g.lt.ribbon);
  set('gp-lt-tagline', g.lt.tagline);
  set('gp-lt-reporter', g.lt.reporter);
  set('gp-lt-reporter-role', g.lt.reporterRole);
  set('gp-bn', g.bn && g.bn.text);
}

function saveGraphicsToStorage() {
  try {
    const g = state.graphics;
    // Persist data: logos; drop transient blob: URLs
    let logoUrl = (g.lt && g.lt.logoUrl) || null;
    if (logoUrl && String(logoUrl).startsWith('blob:')) logoUrl = null;
    const payload = {
      lt: Object.assign({}, g.lt, { logoUrl: logoUrl }),
      bn: g.bn,
      ticker: g.ticker,
      live: g.live,
      clock: g.clock,
      logo: g.logo,
      loc: g.loc
    };
    localStorage.setItem('bb_graphics', JSON.stringify(payload));
    if (typeof pushNotification === 'function') pushNotification('GRAPHICS', 'Graphics saved to this browser', 'ok');
    audit('GFX_SAVE', (g.lt && g.lt.template) || 'graphics');
  } catch (e) {
    if (typeof pushNotification === 'function') pushNotification('GRAPHICS', 'Could not save graphics', 'error');
  }
}

function loadGraphicsFromStorage() {
  try {
    const raw = localStorage.getItem('bb_graphics');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.lt) return false;
    const g = state.graphics;
    if (data.lt) {
      g.lt = Object.assign({}, g.lt, data.lt);
      if (g.lt.logoUrl && String(g.lt.logoUrl).startsWith('blob:')) g.lt.logoUrl = null;
    }
    if (data.bn) g.bn = Object.assign({}, g.bn, data.bn);
    if (data.ticker) g.ticker = Object.assign({}, g.ticker, data.ticker);
    if (data.live) g.live = Object.assign({}, g.live, data.live);
    if (data.clock) g.clock = Object.assign({}, g.clock, data.clock);
    if (data.logo) g.logo = Object.assign({}, g.logo, data.logo);
    if (data.loc) g.loc = Object.assign({}, g.loc, data.loc);
    return true;
  } catch (e) {
    return false;
  }
}
const LT_TEMPLATES = {
  news_update: {
    id: 'news_update', label: 'News Update',
    defaults: {
      title: 'JANE WANJIRU', subtitle: 'News Correspondent', ribbon: 'NEWS UPDATE',
      tagline: 'Keeping you informed across Kenya',
      colors: { accent: '#16a34a', titleBg: '#ffffff', subBg: '#0f172a', tickerBg: '#0b1220', titleFg: '#0f172a', subFg: '#64748b', badgeBg: '#16a34a', brandBg: '#0f172a' }
    }
  },
  live_broadcast: {
    id: 'live_broadcast', label: 'Live Broadcast',
    defaults: {
      title: 'JANE WANJIRU', subtitle: 'News Correspondent', ribbon: 'LIVE BROADCAST',
      tagline: '@NEWS',
      colors: { accent: '#eab308', titleBg: '#eab308', subBg: '#6d28d9', tickerBg: '#0a0a0a', titleFg: '#0f172a', subFg: '#ffffff', badgeBg: '#eab308', brandBg: '#000000' }
    }
  },
  breaking_pro: {
    id: 'breaking_pro', label: 'Breaking Pro',
    defaults: {
      title: 'GOVERNMENT UNVEILS NEW ECONOMIC PLAN',
      subtitle: 'Officials say the plan will create jobs, boost trade and drive growth',
      ribbon: 'BREAKING NEWS', reporter: 'Jane Mwangi', reporterRole: 'CHIEF REPORTER',
      colors: { accent: '#dc2626', titleBg: '#ffffff', subBg: '#1e40af', tickerBg: '#0f172a', titleFg: '#0f172a', subFg: '#dbeafe', badgeBg: '#1e3a8a', brandBg: '#1e3a8a' }
    }
  },
  developing: {
    id: 'developing', label: 'Developing Story',
    defaults: {
      title: 'GOVERNMENT UNVEILS NEW ECONOMIC PLAN',
      subtitle: 'Officials say the plan will create jobs, boost trade and drive growth',
      ribbon: 'DEVELOPING STORY', reporter: 'Jane Mwangi', reporterRole: 'CHIEF REPORTER',
      colors: { accent: '#2563eb', titleBg: '#ffffff', subBg: '#1e3a8a', tickerBg: '#0b1220', titleFg: '#0f172a', subFg: '#bfdbfe', badgeBg: '#1d4ed8', brandBg: '#1e3a8a' }
    }
  },
  classic: {
    id: 'classic', label: 'Classic LT',
    defaults: {
      title: 'KENYA LAUNCHES NEW ECONOMIC REFORMS',
      subtitle: 'Government targets 6% GDP growth in 2026', ribbon: 'BREAKING NEWS',
      colors: { accent: '#2563eb', titleBg: '#ffffff', subBg: '#ffffff', tickerBg: '#0f172a', titleFg: '#0f172a', subFg: '#334155', badgeBg: '#dc2626', brandBg: '#0f172a' }
    }
  },
  sports_bar: {
    id: 'sports_bar', label: 'Sports Bar',
    defaults: {
      title: 'HARAMBEE STARS WIN QUALIFIER', subtitle: 'Full-time 2–1 in Nairobi', ribbon: 'SPORTS',
      colors: { accent: '#ea580c', titleBg: '#fff7ed', subBg: '#9a3412', tickerBg: '#1c1917', titleFg: '#9a3412', subFg: '#ffedd5', badgeBg: '#ea580c', brandBg: '#431407' }
    }
  },
  minimal_name: {
    id: 'minimal_name', label: 'Minimal Name',
    defaults: {
      title: 'JANE WANJIRU', subtitle: 'Field Correspondent · Nairobi', ribbon: '',
      colors: { accent: '#0ea5e9', titleBg: '#0c4a6e', subBg: '#0c4a6e', tickerBg: '#0f172a', titleFg: '#ffffff', subFg: '#bae6fd', badgeBg: '#0284c7', brandBg: '#0c4a6e' }
    }
  }
};

function ltLogoHTML(g) {
  if (g.lt.logoUrl) {
    return '<img class="lt-logo-img" src="' + g.lt.logoUrl + '" alt="logo" />';
  }
  const t = (g.logo && g.logo.text) ? g.logo.text.slice(0, 4) : 'BB';
  return '<div class="lt-logo-fallback">' + t + '</div>';
}

function renderLowerThird() {
  const host = document.getElementById('gfx-lowerthird');
  if (!host) return;
  const g = state.graphics;
  if (!g.lt || !g.lt.enabled) {
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }
  host.style.display = 'block';
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.right = '0';
  host.style.bottom = '0';
  host.style.top = 'auto';
  host.style.width = '100%';
  host.style.height = 'auto';
  host.style.maxHeight = '32%';
  host.style.overflow = 'hidden';
  host.style.zIndex = '15';
  host.style.pointerEvents = 'none';
  const t = g.lt.template || 'classic';
  const c = g.lt.colors || {};
  const logo = ltLogoHTML(g);
  let html = '';

  if (t === 'onair_green') {
    const chName = (g.logo && g.logo.text) ? g.logo.text : 'NEWS ROOM TV';
    html = '<div class="lt-root lt-t-onair_green"><div class="lt-bar">' +
      '<span class="lt-channel">' + chName + '</span>' +
      '<div class="min-w-0 flex-1" style="min-width:0">' +
        '<div class="lt-title">' + (g.lt.title || '') + '</div>' +
        (g.lt.subtitle ? '<div class="lt-sub">' + g.lt.subtitle + '</div>' : '') +
      '</div></div></div>';
  } else if (t === 'news_update') {
    html = '<div class="lt-root lt-t-news_update"><div class="lt-bar">' +
      '<div class="lt-badge" style="background:' + (c.badgeBg || c.accent || '#16a34a') + '"><span>NEWS</span><span>UPDATE</span></div>' +
      '<div class="lt-body" style="background:' + (c.titleBg || '#fff') + '">' + logo +
        '<div class="min-w-0"><div class="lt-title" style="color:' + (c.titleFg || '#0f172a') + '">' + (g.lt.title || '') + '</div>' +
        '<div class="lt-sub" style="color:' + (c.subFg || '#64748b') + '">' + (g.lt.subtitle || '') + '</div></div></div>' +
      '<div class="lt-tag" style="background:' + (c.brandBg || '#0f172a') + '">' + (g.lt.tagline || '') + '</div></div></div>';
  } else if (t === 'live_broadcast') {
    html = '<div class="lt-root lt-t-live_broadcast">' +
      '<div class="lt-top" style="background:' + (c.accent || '#eab308') + '">' + (g.lt.ribbon || 'LIVE BROADCAST') + '</div>' +
      '<div class="lt-bar">' +
        '<div class="lt-body" style="background:' + (c.subBg || '#6d28d9') + '">' +
          '<div class="lt-title">' + (g.lt.title || '') + '</div>' +
          '<div class="lt-sub">' + (g.lt.subtitle || '') + '</div></div>' +
        '<div class="lt-brand" style="background:' + (c.brandBg || '#000') + '">' + logo +
          '<span>' + (g.lt.tagline || '@NEWS') + '</span></div></div></div>';
  } else if (t === 'breaking_pro' || t === 'developing' || t === 'bb_story') {
    const cls = t === 'developing' ? 'lt-t-developing' : 'lt-t-breaking_pro';
    html = '<div class="lt-root ' + cls + '"><div class="lt-bar">' +
      '<div class="lt-logo-slot" style="background:' + (c.badgeBg || c.brandBg || '#1e3a8a') + '">' + logo +
        '<span>' + ((g.logo && g.logo.text) || 'CHANNEL') + '</span></div>' +
      '<div class="lt-main">' +
        '<div class="lt-ribbon" style="background:' + (c.accent || '#dc2626') + '">' + (g.lt.ribbon || 'BREAKING NEWS') + '</div>' +
        '<div class="lt-headline" style="background:' + (c.titleBg || '#fff') + ';color:' + (c.titleFg || '#0f172a') + '">' + (g.lt.title || '') + '</div>' +
        '<div class="lt-deck" style="background:' + (c.subBg || '#1e40af') + ';color:' + (c.subFg || '#dbeafe') + '">' + (g.lt.subtitle || '') + '</div></div>' +
      '<div class="lt-reporter" style="background:' + (c.subBg || '#1e40af') + '">' +
        '<strong>' + (g.lt.reporter || '') + '</strong><span>' + (g.lt.reporterRole || '') + '</span></div></div></div>';
  } else if (t === 'sports_bar') {
    html = '<div class="lt-root lt-t-sports_bar"><div class="lt-bar">' +
      '<div class="lt-badge" style="background:' + (c.badgeBg || c.accent || '#ea580c') + '">' + (g.lt.ribbon || 'SPORTS') + '</div>' +
      '<div class="lt-body" style="background:' + (c.titleBg || '#fff7ed') + '">' +
        '<div class="lt-title" style="color:' + (c.titleFg || '#9a3412') + '">' + (g.lt.title || '') + '</div>' +
        '<div class="lt-sub" style="color:' + (c.subFg || '#9a3412') + '">' + (g.lt.subtitle || '') + '</div></div></div></div>';
  } else if (t === 'minimal_name') {
    html = '<div class="lt-root lt-t-minimal_name"><div class="lt-bar" style="background:' + (c.titleBg || c.brandBg || '#0c4a6e') + '">' +
      logo + '<div><div class="lt-title" style="color:' + (c.titleFg || '#fff') + '">' + (g.lt.title || '') + '</div>' +
      '<div class="lt-sub" style="color:' + (c.subFg || '#bae6fd') + '">' + (g.lt.subtitle || '') + '</div></div></div></div>';
  } else {
    // classic
    html = '<div class="lt-root lt-t-classic">' +
      (g.lt.ribbon ? '<div class="lt-ribbon" style="background:' + (c.accent || '#dc2626') + '">' + g.lt.ribbon + '</div>' : '') +
      '<div class="lt-body" style="background:' + (c.titleBg || '#fff') + ';border-left-color:' + (c.accent || '#2563eb') + '">' +
        logo +
        '<div class="min-w-0"><div class="lt-title" style="color:' + (c.titleFg || '#0f172a') + '">' + (g.lt.title || '') + '</div>' +
        '<div class="lt-sub" style="color:' + (c.subFg || '#334155') + '">' + (g.lt.subtitle || '') + '</div></div></div></div>';
  }
  host.innerHTML = html;
}

function renderTickerStrip() {
  const host = document.getElementById('gfx-ticker');
  if (!host) return;
  const g = state.graphics;
  if (!g.ticker || !g.ticker.enabled) {
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  const c = (g.lt && g.lt.colors) || {};
  const bg = c.tickerBg || '#0f172a';
  const text = g.ticker.text || '';
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const clock = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  host.style.background = bg;
  host.innerHTML = '<div class="ticker-inner">' +
    '<div class="ticker-clock" style="background:' + (c.accent || '#16a34a') + ';color:#fff">' + clock + '</div>' +
    '<div class="ticker-scroll-wrap"><div class="ticker-track" style="color:#e2e8f0">' +
      '<span id="gfx-ticker-text">' + text + '</span><span class="px-6 opacity-40">|</span>' +
      '<span id="gfx-ticker-text-2">' + text + '</span></div></div></div>';
}

function applyGraphicsToProgram() {
  const g = state.graphics;
  const map = { lt: 'gfx-lowerthird', bn: 'gfx-breaking', ticker: 'gfx-ticker', live: 'gfx-live', clock: 'gfx-clock', logo: 'gfx-logo', loc: 'gfx-location' };
  Object.keys(map).forEach(k => {
    const el = document.getElementById(map[k]);
    if (!el) return;
    if (k === 'lt' || k === 'ticker') return; // handled below
    el.style.display = (g[k] && g[k].enabled) ? '' : 'none';
  });
  const loc = document.getElementById('gfx-loc-text');
  const logo = document.getElementById('gfx-logo-text');
  const logoImg = document.getElementById('gfx-logo-img');
  if (loc) loc.textContent = (g.loc && g.loc.text) || '';
  // Circular logo badge: image if uploaded, else short channel initials
  const logoUrl = (g.lt && g.lt.logoUrl) || null;
  if (logoImg) {
    if (logoUrl) {
      logoImg.src = logoUrl;
      logoImg.classList.remove('hidden');
      if (logo) logo.classList.add('hidden');
    } else {
      logoImg.removeAttribute('src');
      logoImg.classList.add('hidden');
      if (logo) {
        logo.classList.remove('hidden');
        const raw = (g.logo && g.logo.text) || 'NR';
        const parts = raw.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
        logo.textContent = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : raw.slice(0, 2).toUpperCase();
      }
    }
  } else if (logo) {
    logo.textContent = (g.logo && g.logo.text) || '';
  }
  renderLowerThird();
  // Keep ticker off Program when using solid on-air green bar
  const tickHost = document.getElementById('gfx-ticker');
  if (tickHost && g.lt && g.lt.template === 'onair_green') {
    tickHost.style.display = 'none';
  } else {
    renderTickerStrip();
  }
  tickProgramClock();
  if (typeof multiOpBroadcast === 'function' && !state._multiOpApplying) {
    try {
      multiOpBroadcast('graphics', { graphics: {
        lt: state.graphics && state.graphics.lt,
        live: state.graphics && state.graphics.live,
        logo: state.graphics && state.graphics.logo,
        ticker: state.graphics && state.graphics.ticker
      }});
    } catch (e) {}
  }

}

function selectLtTemplate(id) {
  if (!LT_TEMPLATES[id]) return;
  const def = LT_TEMPLATES[id].defaults;
  const lt = state.graphics.lt;
  lt.template = id;
  lt.enabled = true;
  if (def.title) lt.title = def.title;
  if (def.subtitle) lt.subtitle = def.subtitle;
  if (def.ribbon != null) lt.ribbon = def.ribbon;
  if (def.tagline != null) lt.tagline = def.tagline;
  if (def.reporter) lt.reporter = def.reporter;
  if (def.reporterRole) lt.reporterRole = def.reporterRole;
  if (def.colors) lt.colors = Object.assign({}, lt.colors || {}, def.colors);
  applyGraphicsToProgram();
  if (typeof renderGraphicsPage === 'function') renderGraphicsPage();
  if (typeof syncGfxEditors === 'function') syncGfxEditors();
  audit('GFX_TEMPLATE', id);
  if (typeof saveGraphicsToStorage === 'function') saveGraphicsToStorage();
}

function updateLtColor(key, value) {
  if (!state.graphics.lt.colors) state.graphics.lt.colors = {};
  state.graphics.lt.colors[key] = value;
  applyGraphicsToProgram();
}

function uploadLtLogo(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    if (typeof pushNotification === 'function') pushNotification('GRAPHICS', 'Logo too large (max 3MB)', 'warn');
    return;
  }
  // Fast path: object URL (instant). Avoid readAsDataURL hang on large images.
  let url;
  try { url = URL.createObjectURL(file); } catch (e) {
    if (typeof pushNotification === 'function') pushNotification('GRAPHICS', 'Logo open failed', 'error');
    return;
  }
  state.graphics.lt.logoUrl = url;
  const prev = document.getElementById('gp-lt-logo-preview');
  if (prev) prev.innerHTML = '<img src="' + url + '" class="h-10 w-auto object-contain" alt="logo" />';
  if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram();
  if (typeof pushNotification === 'function') pushNotification('GRAPHICS', 'Logo applied', 'ok');
  if (typeof audit === 'function') audit('LT_LOGO', file.name || 'logo');
  input.value = '';
}

function applyGfxTemplate(name) {
  const g = state.graphics;
  if (name === 'clear') {
    g.lt.enabled = false; g.bn.enabled = false; g.ticker.enabled = false;
    g.live.enabled = false; g.logo.enabled = false; g.loc.enabled = false; g.clock.enabled = false;
  } else if (name === 'news' || name === 'news_update') {
    selectLtTemplate('news_update');
    g.live.enabled = true; g.loc.enabled = true; g.logo.enabled = true; g.ticker.enabled = true; g.clock.enabled = true;
    return;
  } else if (name === 'breaking') {
    selectLtTemplate('breaking_pro');
    g.live.enabled = true; g.loc.enabled = true; g.logo.enabled = true; g.ticker.enabled = true; g.bn.enabled = true;
    return;
  } else if (name === 'sports') {
    selectLtTemplate('sports_bar');
    g.live.enabled = true; g.ticker.enabled = true; g.clock.enabled = true;
    return;
  } else if (name === 'weather') {
    selectLtTemplate('minimal_name');
    g.lt.title = 'NAIROBI WEATHER';
    g.lt.subtitle = 'Partly cloudy · 24°C';
    g.live.enabled = true; g.loc.enabled = true; g.ticker.enabled = true;
  }
  applyGraphicsToProgram();
  if (typeof updateToggleUI === 'function') {
    ['lt','bn','ticker','live','logo','loc','clock'].forEach(k => { try { updateToggleUI(k); } catch (e) {} });
  }
  if (typeof syncGfxEditors === 'function') syncGfxEditors();
  if (typeof notifyBridgeState === 'function') notifyBridgeState();
}

function tickProgramClock() {
  const el = document.getElementById('gfx-clock');
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const t = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  if (el) {
    const on = state.graphics && state.graphics.clock && state.graphics.clock.enabled;
    el.style.display = on ? '' : 'none';
    if (on) el.textContent = t;
  }
  const tc = document.querySelector('#gfx-ticker .ticker-clock');
  if (tc) tc.textContent = t;
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
    const joinUrl = appPageUrl('guest.html', 'token=' + encodeURIComponent(slot.token) + '&mic=external');
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
  const items = (typeof navItems !== 'undefined' && navItems.length) ? navItems : [
    { id: 'home', label: 'Home', icon: '⌂' }, { id: 'studio', label: 'Studio', icon: '▣' },
    { id: 'news', label: 'News Director', icon: '🎬' }, { id: 'sources', label: 'Sources', icon: '📡' },
    { id: 'ads', label: 'Ads', icon: '📢' }, { id: 'graphics', label: 'Graphics', icon: '🗂' },
    { id: 'guests', label: 'Guests', icon: '👥' }, { id: 'destinations', label: 'Destinations', icon: '📤' },
    { id: 'analytics', label: 'Analytics', icon: '📊' }, { id: 'audio', label: 'Audio', icon: '🔊' },
    { id: 'recordings', label: 'Recordings', icon: '🎞' }, { id: 'users', label: 'Users', icon: '👤' },
    { id: 'layouts', label: 'Layouts', icon: '▦' },
    { id: 'marketplace', label: 'Marketplace', icon: '🏷' },
    { id: 'watch', label: 'Watch', icon: '▶' },
    { id: 'settings', label: 'Settings', icon: '⚙' }
  ];
  el.innerHTML = items.map(n => {
    const active = n.id === (state.currentView || 'studio');
    return '<button type="button" data-nav="' + n.id + '" onclick="navigateTo(\'' + n.id + '\')" class="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] ' +
      (active ? 'nav-active' : 'text-slate-400 hover:text-white border-l-2 border-transparent') +
      '"><span class="w-4 text-center shrink-0">' + (n.icon || '•') + '</span><span class="truncate">' + n.label + '</span></button>';
  }).join('');
  ensureSidebarVisible();
}

function ensureSidebarVisible() {
  const side = document.getElementById('app-sidebar') || document.querySelector('.app-sidebar');
  if (!side) return;
  side.style.display = 'flex';
  side.style.visibility = 'visible';
  side.style.opacity = '1';
  side.style.pointerEvents = 'auto';
  side.style.zIndex = '50';
  // Desktop: fixed rail always on-screen. Mobile: drawer controlled by .nav-open
  const mobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  if (!mobile) {
    side.style.position = 'relative';
    side.style.transform = 'none';
    side.style.width = '168px';
    side.style.minWidth = '168px';
    side.style.maxWidth = '168px';
    side.style.flex = '0 0 168px';
    document.body.classList.remove('nav-open');
    const bd = document.getElementById('sidebar-backdrop');
    if (bd) bd.classList.remove('show');
  } else {
    // Mobile drawer: do not force 168px inline (breaks CSS drawer width)
    side.style.width = '';
    side.style.minWidth = '';
    side.style.maxWidth = '';
    side.style.flex = '';
    side.style.position = '';
    // leave transform to CSS (.nav-open)
  }
}
window.ensureSidebarVisible = ensureSidebarVisible;


function navigateTo(id) {
  if (!id) return;
  const implemented = { studio: true, destinations: true, recordings: true, home: true, users: true, analytics: true, settings: true, guests: true, news: true, sources: true, ads: true, graphics: true, audio: true, watch: true, layouts: true, marketplace: true, wallet: true, earnings: true, subscriptions: true, withdraw: true, 'admin-finance': true };
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
  const watch = document.getElementById('view-watch');
  const layouts = document.getElementById('view-layouts');
  const marketplace = document.getElementById('view-marketplace');
  const adminFinance = document.getElementById('view-admin-finance');
  const wallet = document.getElementById('view-wallet');
  const earnings = document.getElementById('view-earnings');
  const subscriptions = document.getElementById('view-subscriptions');
  const withdraw = document.getElementById('view-withdraw');

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
  if (watch) watch.classList.toggle('hidden', id !== 'watch');
  if (layouts) layouts.classList.toggle('hidden', id !== 'layouts');
  if (marketplace) marketplace.classList.toggle('hidden', id !== 'marketplace');
  if (adminFinance) adminFinance.classList.toggle('hidden', id !== 'admin-finance');
  if (wallet) wallet.classList.toggle('hidden', id !== 'wallet');
  if (earnings) earnings.classList.toggle('hidden', id !== 'earnings');
  if (subscriptions) subscriptions.classList.toggle('hidden', id !== 'subscriptions');
  if (withdraw) withdraw.classList.toggle('hidden', id !== 'withdraw');

  renderNav();
if (typeof ensureDirectorBridge === 'function') ensureDirectorBridge();
  if (id === 'destinations') {
    if (typeof loadDestQuality === 'function') loadDestQuality();
    if (typeof loadDestLocalIntoForm === 'function') loadDestLocalIntoForm();
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
  if (typeof renderAdvancedView === 'function') renderAdvancedView(id);
  if (id === 'settings') {
    if (typeof checkFinanceHealth === 'function') setTimeout(checkFinanceHealth, 200);
    if (typeof renderPublicLinks === 'function') renderPublicLinks();
    if (typeof loadSettingsForm === 'function') loadSettingsForm();
    if (typeof renderAuditLog === 'function') renderAuditLog();
  }
  if (id === 'guests') {
    renderGuestsPage();
    if (typeof loadGuestTokensPanel === 'function') loadGuestTokensPanel();
  }
  if (id === 'news') {
    renderNewsDirectorPage();
  }
  if (id === 'admin-finance' && typeof loadAdminFinance === 'function') loadAdminFinance();
  if (id === 'wallet' && typeof loadWalletDashboard === 'function') loadWalletDashboard();
  if ((id === 'wallet' || id === 'earnings' || id === 'home') && typeof updateFinanceNavBadge === 'function') updateFinanceNavBadge();
  if (id === 'withdraw' && typeof loadWithdrawDashboard === 'function') loadWithdrawDashboard();
  if (id === 'earnings' && typeof loadEarningsDashboard === 'function') loadEarningsDashboard();
  if (id === 'subscriptions' && typeof loadSubscriptionDashboard === 'function') loadSubscriptionDashboard();
  if (id === 'layouts' && typeof renderLayoutBuilder === 'function') renderLayoutBuilder();
  if (id === 'marketplace' && typeof renderMarketplace === 'function') renderMarketplace();
  if (id === 'sources') {
    renderSourcesPage();
    if (typeof refreshMediaDevices === 'function') refreshMediaDevices();
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
  if (id === 'watch') {
    if (typeof updateWatchView === 'function') updateWatchView();
    if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher(true);
    const link = document.getElementById('watch-public-link');
    if (link && typeof appPageUrl === 'function') link.href = appPageUrl('watch.html');
  }
  if (typeof ensureSidebarVisible === 'function') ensureSidebarVisible();
}
window.navigateTo = navigateTo;

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
  // Template gallery
  const gal = document.getElementById('lt-template-gallery');
  if (gal && typeof LT_TEMPLATES !== 'undefined') {
    const cur = (state.graphics.lt && state.graphics.lt.template) || 'classic';
    gal.innerHTML = Object.keys(LT_TEMPLATES).map(id => {
      const t = LT_TEMPLATES[id];
      const active = id === cur;
      return '<button type="button" onclick="selectLtTemplate(\'' + id + '\')" class="text-left px-2 py-2 rounded border text-[10px] ' +
        (active ? 'border-blue-500 bg-blue-950/50 text-blue-100' : 'border-[#1e2a3a] bg-[#131a28] text-slate-300 hover:border-slate-500') + '">' +
        '<div class="font-bold">' + t.label + '</div><div class="text-[8px] text-slate-500 mt-0.5">' + id + '</div></button>';
    }).join('');
  }
  const tn = document.getElementById('gp-lt-template-name');
  if (tn) tn.textContent = (state.graphics.lt && state.graphics.lt.template) || '—';
  const setIn = (id, val) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = val != null ? val : ''; };
  setIn('gp-lt-title', state.graphics.lt.title);
  setIn('gp-lt-sub', state.graphics.lt.subtitle);
  setIn('gp-lt-ribbon', state.graphics.lt.ribbon);
  setIn('gp-lt-tagline', state.graphics.lt.tagline);
  setIn('gp-lt-reporter', state.graphics.lt.reporter);
  setIn('gp-lt-reporter-role', state.graphics.lt.reporterRole);
  const cols = state.graphics.lt.colors || {};
  ['accent','titleBg','subBg','tickerBg','titleFg','subFg'].forEach(k => {
    const el = document.getElementById('gp-lt-c-' + k);
    if (el && cols[k]) el.value = cols[k];
  });

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
        '<td class="px-2 py-2"><div class="flex flex-wrap gap-0.5">' +
          '<button onclick="selectSource(\'' + s.id + '\'); renderSourcesPage();" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-800 text-white">PVW</button>' +
          '<button onclick="takeSourceDirect(\'' + s.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-800 text-white">TAKE</button>' +
          '<button onclick="cutSourceDirect(\'' + s.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-white">CUT</button>' +
          '<button onclick="fadeSourceDirect(\'' + s.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-800 text-white">FADE</button>' +
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
  if (typeof renderHardwareDevicePanels === 'function') renderHardwareDevicePanels();
  if (typeof renderRemoteCameraSessions === 'function') renderRemoteCameraSessions();
}

function takeSourceDirect(id) {
  if (state.priority === 'EMERGENCY' || state.hold) return;
  selectSource(id);
  doTake();
  renderSourcesPage();
}

let addSourceType = 'youtube';


function cutSourceDirect(id) {
  if (state.priority === 'EMERGENCY' || state.hold) return;
  selectSource(id);
  if (typeof doCut === 'function') doCut();
  else if (typeof completeTake === 'function') completeTake({ type: 'CUT', durationMs: 0 });
  if (typeof renderSourcesPage === 'function') renderSourcesPage();
  if (typeof audit === 'function') audit('CUT', id);
}

function fadeSourceDirect(id) {
  if (state.priority === 'EMERGENCY' || state.hold) return;
  selectSource(id);
  if (typeof doFade === 'function') doFade();
  else if (typeof completeTake === 'function') completeTake({ type: 'FADE', durationMs: state.fadeDurationMs || 500 });
  if (typeof renderSourcesPage === 'function') renderSourcesPage();
  if (typeof audit === 'function') audit('FADE', id);
}
window.cutSourceDirect = cutSourceDirect;
window.fadeSourceDirect = fadeSourceDirect;


// ===== Fast local media/image add (blob URLs — no base64 hang) =====
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function addLocalMediaFile(file, nameHint, setMsg) {
  setMsg = setMsg || function () {};
  if (!file) {
    setMsg('No file selected.', false);
    return false;
  }
  // Soft limit — still allow large files via blob URL (no read into memory as base64)
  if (file.size > 800 * 1024 * 1024) {
    setMsg('File too large (max 800MB in browser). Use a shorter clip or compress.', false);
    return false;
  }
  const progress = document.getElementById('as-media-progress');
  if (progress) {
    progress.classList.remove('hidden');
    progress.textContent = 'Linking ' + (file.name || 'video') + ' (' + formatFileSize(file.size) + ')…';
  }
  const sub = document.getElementById('as-submit');
  if (sub) { sub.disabled = true; sub.textContent = 'Adding…'; }

  // Instant path: object URL does not read the whole file into JS memory
  let url;
  try {
    url = URL.createObjectURL(file);
  } catch (e) {
    if (progress) progress.textContent = 'Failed: ' + (e.message || e);
    if (sub) { sub.disabled = false; sub.textContent = 'Add to sources'; }
    setMsg('Could not open file: ' + (e.message || e), false);
    return false;
  }

  const name = (nameHint || '').trim() || (file.name || 'Uploaded media').replace(/\.[^.]+$/, '');
  const id = 'media_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const src = {
    id: id,
    name: name,
    type: 'media',
    status: 'ready',
    res: 'local',
    role: 'Package',
    color: '#854d0e',
    icon: '🎬',
    hasStream: true,
    mediaUrl: url,
    mediaMime: file.type || 'video/*',
    mediaSize: file.size,
    mediaFileName: file.name || name
  };
  state.sources.push(src);
  SOURCE_MAP[name] = id;

  // Probe duration/resolution without blocking UI long
  try {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.src = url;
    probe.onloadedmetadata = function () {
      if (probe.videoHeight) src.res = probe.videoHeight + 'p';
      if (probe.duration && isFinite(probe.duration)) src.durationSec = Math.round(probe.duration);
      try { if (typeof renderSourcesPage === 'function') renderSourcesPage(); } catch (e) {}
    };
  } catch (e) {}

  if (typeof audit === 'function') audit('SOURCE_ADD', 'Media ' + name + ' ' + formatFileSize(file.size));
  if (typeof pushNotification === 'function') pushNotification('MEDIA', name + ' ready — PVW / TAKE', 'ok');
  setMsg('Added: ' + name + ' (' + formatFileSize(file.size) + ')', true);
  if (progress) progress.textContent = 'Ready · ' + name;
  if (sub) { sub.disabled = false; sub.textContent = 'Add to sources'; }

  // Clear file input so same file can be re-selected; close modal shortly
  const fileInput = document.getElementById('as-media-file');
  if (fileInput) fileInput.value = '';
  try { renderSources(); } catch (e) {}
  try { renderSourcesPage(); } catch (e) {}
  try {
    if (typeof selectSource === 'function') selectSource(id);
    state.previewSlots[0] = id;
    if (typeof renderPreview === 'function') renderPreview();
  } catch (e) {}
  setTimeout(function () { closeAddSourceModal(); }, 250);
  return true;
}

function addLocalImageFile(file, nameHint, setMsg) {
  setMsg = setMsg || function () {};
  if (!file) {
    setMsg('No file selected.', false);
    return false;
  }
  if (file.size > 25 * 1024 * 1024) {
    setMsg('Image too large (max 25MB).', false);
    return false;
  }
  const progress = document.getElementById('as-image-progress');
  if (progress) {
    progress.classList.remove('hidden');
    progress.textContent = 'Linking image…';
  }
  let url;
  try {
    url = URL.createObjectURL(file);
  } catch (e) {
    setMsg('Could not open image: ' + (e.message || e), false);
    return false;
  }
  const name = (nameHint || '').trim() || (file.name || 'Still image').replace(/\.[^.]+$/, '');
  const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  state.sources.push({
    id: id,
    name: name,
    type: 'image',
    status: 'ready',
    res: 'still',
    role: 'Image',
    color: '#4c1d95',
    icon: '🖼',
    hasStream: true,
    imageUrl: url,
    mediaFileName: file.name || name
  });
  SOURCE_MAP[name] = id;
  if (typeof audit === 'function') audit('SOURCE_ADD', 'Image ' + name);
  if (typeof pushNotification === 'function') pushNotification('IMAGE', name + ' ready — TAKE to Program', 'ok');
  setMsg('Added: ' + name, true);
  if (progress) progress.textContent = 'Ready';
  const fileInput = document.getElementById('as-image-file');
  if (fileInput) fileInput.value = '';
  try { renderSources(); } catch (e) {}
  try { renderSourcesPage(); } catch (e) {}
  try {
    if (typeof selectSource === 'function') selectSource(id);
    state.previewSlots[0] = id;
    if (typeof renderPreview === 'function') renderPreview();
  } catch (e) {}
  setTimeout(function () { closeAddSourceModal(); }, 250);
  return true;
}

function onMediaFilePicked(input) {
  const file = input && input.files && input.files[0];
  const msg = document.getElementById('add-src-msg');
  const setMsg = function (text, ok) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.className = 'text-[10px] min-h-[16px] mt-2 ' + (ok ? 'text-green-400' : 'text-red-400');
  };
  if (!file) return;
  addSourceType = 'media';
  // Auto-add on select — no extra click needed
  addLocalMediaFile(file, (document.getElementById('as-media-name') || {}).value || '', setMsg);
}

function onImageFilePicked(input) {
  const file = input && input.files && input.files[0];
  const msg = document.getElementById('add-src-msg');
  const setMsg = function (text, ok) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.className = 'text-[10px] min-h-[16px] mt-2 ' + (ok ? 'text-green-400' : 'text-red-400');
  };
  if (!file) return;
  addSourceType = 'image';
  addLocalImageFile(file, (document.getElementById('as-image-name') || {}).value || '', setMsg);
}

window.addLocalMediaFile = addLocalMediaFile;
window.addLocalImageFile = addLocalImageFile;
window.onMediaFilePicked = onMediaFilePicked;
window.onImageFilePicked = onImageFilePicked;


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
    const nameEl = document.getElementById('as-media-name');
    const fileInput = document.getElementById('as-media-file');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      setMsg('Choose a video file (MP4/WebM recommended).', false);
      return;
    }
    return addLocalMediaFile(file, (nameEl && nameEl.value) || '', setMsg);
  }
  if (addSourceType === 'image') {
    const nameEl = document.getElementById('as-image-name');
    const fileInput = document.getElementById('as-image-file');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      setMsg('Choose an image file.', false);
      return;
    }
    return addLocalImageFile(file, (nameEl && nameEl.value) || '', setMsg);
  }
  if (addSourceType === 'remote') {
    const name = (document.getElementById('as-remote-name').value || '').trim() || 'Remote camera';
    const token = 'tok_rm_' + Math.random().toString(36).slice(2, 10);
    const id = 'remote_' + Math.random().toString(36).slice(2, 7);
    const camEl = document.getElementById('as-remote-cam');
    const micEl = document.getElementById('as-remote-mic');
    const facing = (camEl && camEl.value) || 'user';
    const micPref = (micEl && micEl.value) || 'external';
    const shareUrl = appPageUrl('remote.html', 'token=' + encodeURIComponent(token) + '&cam=' + encodeURIComponent(facing) + '&mic=' + encodeURIComponent(micPref));
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
  set('set-finance-url', s.financeApiUrl || '');
  if (typeof renderPublicLinks === 'function') renderPublicLinks();
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
  const ar = document.getElementById('set-auto-record');
  if (ar) ar.checked = !!s.autoRecordOnLive;
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
  const arEl = document.getElementById('set-auto-record');
  s.autoRecordOnLive = arEl ? arEl.checked : !!s.autoRecordOnLive;
  const pubEl = document.getElementById('set-public-url');
  s.publicBaseUrl = pubEl ? pubEl.value.trim().replace(/\/+$/, '') : (s.publicBaseUrl || '');
  const finEl = document.getElementById('set-finance-url');
  if (finEl) s.financeApiUrl = finEl.value.trim().replace(/\/+$/, '');
  const fadeEl = document.getElementById('set-fade-ms');
  if (fadeEl) {
    const ms = Math.max(100, Math.min(5000, parseInt(fadeEl.value, 10) || 500));
    s.fadeDurationMs = ms;
    state.fadeDurationMs = ms;
  }
  if (typeof renderPublicLinks === 'function') renderPublicLinks();

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
      autoRecordOnLive: !!s.autoRecordOnLive,
      bridgeUrl: s.bridgeUrl,
      publicBaseUrl: s.publicBaseUrl || '',
      financeApiUrl: s.financeApiUrl || '',
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
  // extended panels filled at end via fillAnalyticsExtended()

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
        '<td class="px-2 py-2"><div class="flex gap-1 flex-wrap">' +
          (me ? '' : '<button onclick="assumeUser(\'' + u.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-100">Assume</button>') +
          (active
            ? '<button onclick="setUserStatus(\'' + u.id + '\',\'offline\')" class="text-[9px] px-1.5 py-0.5 rounded bg-[#1e2a3a] text-slate-300">Set offline</button>'
            : '<button onclick="setUserStatus(\'' + u.id + '\',\'active\')" class="text-[9px] px-1.5 py-0.5 rounded bg-green-900 text-green-300">Activate</button>') +
          (!me ? '<button onclick="removeUser(\'' + u.id + '\')" class="text-[9px] px-1.5 py-0.5 rounded bg-red-950 text-red-300">Remove</button>' : '') +
        '</div></td></tr>';
    }).join('');
  }
  if (roles) {
    roles.innerHTML = (state.roleDefs || []).map(r => {
      const caps = (typeof ROLE_CAPS !== 'undefined' && ROLE_CAPS[r.id]) ? ROLE_CAPS[r.id] : [];
      const capStr = (caps[0] === '*') ? 'all capabilities' : (caps.length ? caps.join(', ') : 'read-only');
      return '<div class="px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a]">' +
        '<div class="text-slate-200 font-medium">' + r.label + '</div>' +
        '<div class="text-slate-500">' + r.desc + '</div>' +
        '<div class="text-[8px] text-slate-600 mt-0.5">' + capStr + '</div></div>';
    }).join('');
  }
  if (typeof applyRoleGates === 'function') applyRoleGates();
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
  if (typeof loadHomeFinanceSnapshot === 'function') loadHomeFinanceSnapshot();

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
  set('home-health-bridge', connected ? (mode === 'stub' || mode === 'local' ? 'LOCAL' : 'CONNECTED') : 'OFFLINE');
  const pipe = (st && st.pipeline) || {};
  let hw = (pipe.webrtc && pipe.webrtc.state) || 'ready';
  if (hw === 'offline') hw = 'ready';
  set('home-health-webrtc', hw);
  const enc = pipe.encoder || {};
  let he = enc.dryRun && enc.state === 'live' ? 'live (dry-run)' : (enc.state || 'ready');
  if (he === 'offline') he = 'ready';
  set('home-health-encoder', he);
  let hr = (pipe.rtmp && pipe.rtmp.state) || 'standby';
  if (hr === 'offline') hr = 'standby';
  set('home-health-rtmp', hr);
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

  // Recent alerts from notification center
  const alerts = document.getElementById('home-alerts');
  if (alerts) {
    const items = (state.notifications || []).slice(0, 8);
    if (!items.length) {
      alerts.innerHTML = '<div class="text-slate-500 px-2 py-2">No alerts yet</div>';
    } else {
      const kindColor = { error: 'text-red-400', warn: 'text-amber-400', ok: 'text-green-400', info: 'text-cyan-400' };
      alerts.innerHTML = items.map(function (n) {
        return '<div class="px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a]/60">' +
          '<div class="flex justify-between gap-2"><span class="font-semibold ' + (kindColor[n.kind] || 'text-slate-200') + '">' + (n.title || '') + '</span>' +
          '<span class="text-[9px] text-slate-600 font-mono">' + (n.time || '') + '</span></div>' +
          (n.body ? '<div class="text-slate-400 text-[10px] mt-0.5 truncate">' + n.body + '</div>' : '') +
          '</div>';
      }).join('');
    }
  }

  // Session TAKE count on home if element exists
  set('home-takes', String(state.sessionTakes || 0));
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
  mode: (window.BRIDGE_WS_URL && window.BRIDGE_STUB_MODE === false) ? 'live' : 'local',
  broadcastId: 'bb-local-broadcast'
});

function enrichBridgeLocalStatus(status) {
  if (!status || !status.pipeline) return;
  const hasCam = !!(state.media && state.media.localStream);
  const hasScreen = !!(state.media && state.media.screenStream);
  const hasGuest = (state.sources || []).some(function (s) { return (s.type === 'guest' || s.type === 'remote') && s.hasStream; });
  const publishers = (hasCam ? 1 : 0) + (hasScreen ? 1 : 0) + (hasGuest ? 1 : 0);
  const comp = !!(state.media && state.media.compositorActive);
  const rec = !!(state.media && state.media.recording);
  const live = state.broadcastState === 'live';

  status.pipeline.webrtc = {
    state: publishers > 0 ? 'live' : (live ? 'ready' : 'ready'),
    publishers: publishers
  };
  status.pipeline.compositor = { state: (comp || live) ? 'live' : 'ready' };
  status.pipeline.encoder = {
    state: rec ? 'recording' : ((comp || live) ? 'ready' : 'ready'),
    bitrateKbps: rec ? 2500 : ((comp || live) ? 0 : null),
    fps: (comp || live) ? 30 : null
  };

  // Destinations: support array or map-style state
  let destList = [];
  if (Array.isArray(state.destinations)) destList = state.destinations;
  else if (state.destinations && typeof state.destinations === 'object') {
    destList = Object.keys(state.destinations).map(function (k) {
      return Object.assign({ id: k }, state.destinations[k]);
    });
  }
  // Also track explicit local flags from bridgeStartDest
  const localFlags = state._localDestStreaming || {};
  const anyDest = destList.some(function (d) { return d.streaming; }) ||
    Object.keys(localFlags).some(function (k) { return localFlags[k]; });
  const anyUrl = destList.some(function (d) { return d.url || d.streamKey || d.rtmpUrl; });
  status.pipeline.rtmp = {
    state: anyDest ? 'live' : (anyUrl ? 'configured' : 'standby')
  };

  // Per-destination health for UI
  status.destinations = status.destinations || {};
  ['youtube', 'facebook', 'rtmp'].forEach(function (k) {
    const streaming = !!(localFlags[k] || (destList.find(function (d) { return (d.id === k || d.name === k) && d.streaming; })));
    status.destinations[k] = status.destinations[k] || {};
    status.destinations[k].streaming = streaming;
    status.destinations[k].health = streaming ? 'live' : (status.destinations[k].configured ? 'idle' : 'standby');
    status.destinations[k].configured = true;
  });

  status.bridgeMode = (bridge && bridge.mode === 'stub') ? 'local' : (bridge ? bridge.mode : 'local');
  status.connected = true;
  status.recording = status.recording || {};
  status.recording.program = { active: rec, durationSec: rec ? Math.round(((Date.now() - (state.media.recStartedAt || Date.now())) / 1000)) : 0 };
}

if (bridge && typeof bridge.setLocalEnricher === 'function') {
  bridge.setLocalEnricher(enrichBridgeLocalStatus);
}


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
      const label = (mode === 'stub' || mode === 'local') ? 'LOCAL' : 'CONNECTED';
      bridgePill.textContent = label;
      bridgePill.className = 'text-[9px] px-1.5 py-0.5 rounded bg-cyan-900 border border-cyan-600 text-cyan-300 font-semibold';
    } else {
      bridgePill.textContent = 'CONNECTING';
      bridgePill.className = 'text-[9px] px-1.5 py-0.5 rounded bg-amber-900 border border-amber-700 text-amber-200 font-semibold';
    }
  }
  if (bridgeMode) bridgeMode.textContent = 'mode: ' + ((mode === 'stub') ? 'local' : mode);
  if (bridgeSeq) bridgeSeq.textContent = 'seq: ' + ((status.program && status.program.sequence) || 0);

  const pipe = status.pipeline || {};
  let webrtc = (pipe.webrtc && pipe.webrtc.state) || 'ready';
  const encObj = pipe.encoder || {};
  let enc = encObj.state || 'ready';
  let rtmp = (pipe.rtmp && pipe.rtmp.state) || 'standby';
  if (webrtc === 'offline') webrtc = 'ready';
  if (enc === 'offline') enc = 'ready';
  if (rtmp === 'offline') rtmp = 'standby';
  const dry = !!encObj.dryRun || rtmp === 'dry-run';

  const liveKind = function (s) {
    if (s === 'live' || s === 'recording') return 'live';
    if (s === 'error') return 'err';
    if (s === 'dry-run' || s === 'configured') return 'warn';
    return 'idle';
  };
  setPipeLabel('pipe-webrtc', webrtc, liveKind(webrtc));
  setPipeLabel('pipe-encoder', dry && enc === 'live' ? 'live (dry-run)' : enc, liveKind(enc));
  setPipeLabel('pipe-rtmp', rtmp, liveKind(rtmp));

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
      mediaBadge.textContent = mode === 'local' || mode === 'stub' ? 'LOCAL' : 'OFFLINE';
      mediaBadge.className = 'px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-medium';
    }
  }

  const sub = document.getElementById('sidebar-media-sub');
  if (sub) {
    if (dests.youtube && dests.youtube.streaming) sub.textContent = 'STREAMING';
    else if (dry && enc === 'live') sub.textContent = 'ENCODER DRY-RUN';
    else if (state.media && state.media.localStream) sub.textContent = 'CAMERA LIVE';
    else sub.textContent = mode === 'local' || mode === 'stub' ? 'LOCAL PIPELINE' : 'NOT CONNECTED';
  }

  const modeBtn = document.getElementById('btn-bridge-mode');
  if (modeBtn && bridge) {
    modeBtn.textContent = bridge.mode === 'stub' ? 'Use Live WS' : 'Use Stub';
  }

  // Destinations page cards
  const pageBridge = document.getElementById('dest-page-bridge');
  if (pageBridge) {
    const mode = status.bridgeMode || (bridge && bridge.mode) || '—';
    pageBridge.textContent = connected ? ('Bridge ' + (mode === 'stub' || mode === 'local' ? 'LOCAL' : 'CONNECTED')) : 'Bridge OFFLINE';
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

  // Local mode: mark destination active so RTMP pipeline shows live (operator intent)
  state._localDestStreaming = state._localDestStreaming || {};
  state._localDestStreaming[destination] = true;
  if (Array.isArray(state.destinations)) {
    state.destinations.forEach(function (d) {
      if (d.id === destination || (d.name && d.name.toLowerCase().indexOf(destination) >= 0)) d.streaming = true;
    });
  }

  bridge.send('destination.control', {
    destination: destination,
    action: 'start',
    streamUrl: creds.url || undefined,
    streamKey: creds.key || undefined,
    quality: state.destQuality || (document.getElementById('dest-quality') && document.getElementById('dest-quality').value) || '1080p30'
  });

  // Refresh pipeline UI immediately
  if (typeof enrichBridgeLocalStatus === 'function' && bridge.lastStatus) {
    enrichBridgeLocalStatus(bridge.lastStatus);
    applyBridgeStatusToUI(bridge.lastStatus);
  }
  if (bridge.mode === 'local' || bridge.mode === 'stub') {
    bridgeMsg(destination + ' marked live on local pipeline. Server RTMP only if Bridge WS is connected.', 'ok');
    destPageMsg(destination + ' · local pipeline live', 'ok');
  }
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



function destStartAll() {
  ['youtube', 'facebook', 'rtmp'].forEach(function (d) {
    try { bridgeStartDest(d); } catch (e) {}
  });
  destPageMsg('Start all: local pipeline RTMP live for each dest. Server encode only with live Bridge WS.', 'ok');
  audit('DEST_START_ALL', 'youtube|facebook|rtmp');
  if (typeof pushNotification === 'function') pushNotification('Destinations', 'Start all — pipeline updated', 'ok');
  if (typeof renderHomeDashboard === 'function') renderHomeDashboard();
}
function destStopAll() {
  ['youtube', 'facebook', 'rtmp'].forEach(function (d) {
    try { bridgeStopDest(d); } catch (e) {}
  });
  destPageMsg('Stop requested for all destinations.', 'warn');
  audit('DEST_STOP_ALL', 'youtube|facebook|rtmp');
  if (typeof pushNotification === 'function') pushNotification('Destinations', 'Stop all requested', 'info');
}
function saveDestQuality() {
  const el = document.getElementById('dest-quality');
  if (!el) return;
  try { localStorage.setItem('bb_dest_quality', el.value); } catch (e) {}
  state.destQuality = el.value;
  destPageMsg('Encode target preset: ' + el.value + ' (applied when Bridge encoder is connected).', 'ok');
  audit('DEST_QUALITY', el.value);
}
function loadDestQuality() {
  let q = '1080p30';
  try { q = localStorage.getItem('bb_dest_quality') || q; } catch (e) {}
  state.destQuality = q;
  const el = document.getElementById('dest-quality');
  if (el) el.value = q;
}
window.destStartAll = destStartAll;
window.destStopAll = destStopAll;
window.saveDestQuality = saveDestQuality;

function bridgeStopDest(destination) {
  if (!bridge || !bridge.connected) {
    bridgeMsg('Bridge offline — click Reconnect', 'err');
    destPageMsg('Bridge offline — click Reconnect', 'err');
    return;
  }
  bridgeMsg('Stopping ' + destination + '…', 'warn');
  destPageMsg('Stopping ' + destination + '…', 'warn');
  state._localDestStreaming = state._localDestStreaming || {};
  state._localDestStreaming[destination] = false;
  if (Array.isArray(state.destinations)) {
    state.destinations.forEach(function (d) {
      if (d.id === destination || (d.name && d.name.toLowerCase().indexOf(destination) >= 0)) d.streaming = false;
    });
  }
  bridge.send('destination.control', { destination: destination, action: 'stop' });
  if (typeof enrichBridgeLocalStatus === 'function' && bridge.lastStatus) {
    enrichBridgeLocalStatus(bridge.lastStatus);
    applyBridgeStatusToUI(bridge.lastStatus);
  }
  bridgeMsg(destination + ' stopped on local pipeline', 'ok');
  destPageMsg(destination + ' stopped', 'ok');
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
  if (bridge.mode === 'local' || bridge.mode === 'stub') {
    window.BRIDGE_WS_URL = window.BRIDGE_WS_URL || 'ws://localhost:8787/bridge';
    window.BRIDGE_STUB_MODE = false;
    bridge.mode = 'live';
    bridgeMsg('Switching to live WS: ' + window.BRIDGE_WS_URL, 'warn');
  } else {
    window.BRIDGE_STUB_MODE = false;
    bridge.mode = 'local';
    bridgeMsg('Switching to local Bridge pipeline', 'warn');
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


function applyAdAudioDuck() {
  if (!state.audio) return;
  if (state.audio.ducked) return;
  state.audio.preDuckMaster = state.audio.master.level;
  const amt = Math.max(0, Math.min(90, state.audio.duckAmount != null ? state.audio.duckAmount : 35));
  const target = Math.max(5, Math.round(state.audio.master.level * (1 - amt / 100)));
  state.audio.master.level = target;
  state.audio.ducked = true;
  // Prefer ads channel audible
  const adsCh = state.audio.channels.find(c => c.id === 'ads');
  if (adsCh) {
    adsCh._preDuck = adsCh.level;
    adsCh.level = Math.max(adsCh.level, 80);
    adsCh.mute = false;
  }
  if (typeof renderAudioMixer === 'function') renderAudioMixer();
  if (typeof applyLocalAudioGain === 'function') applyLocalAudioGain();
  updateDuckBadge();
  audit('AUDIO_DUCK', 'Master → ' + target + ' during ad');
}

function releaseAdAudioDuck() {
  if (!state.audio || !state.audio.ducked) return;
  if (state.audio.preDuckMaster != null) {
    state.audio.master.level = state.audio.preDuckMaster;
  }
  state.audio.preDuckMaster = null;
  state.audio.ducked = false;
  const adsCh = state.audio.channels.find(c => c.id === 'ads');
  if (adsCh && adsCh._preDuck != null) {
    adsCh.level = adsCh._preDuck;
    delete adsCh._preDuck;
  }
  if (typeof renderAudioMixer === 'function') renderAudioMixer();
  if (typeof applyLocalAudioGain === 'function') applyLocalAudioGain();
  updateDuckBadge();
  audit('AUDIO_UNDUCK', 'Master restored');
}

function updateDuckBadge() {
  const b = document.getElementById('aud-duck-badge');
  if (!b) return;
  const on = !!(state.audio && state.audio.ducked);
  b.classList.toggle('hidden', !on);
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
  applyAdAudioDuck();
  audit('AD_PLAY', ad.title);
  // Server-side revenue event (40/60) — does not trust client balances
  if (typeof reportAdRevenue === 'function') {
    try { reportAdRevenue(ad, { playId: ad.id + '_' + ad.plays + '_' + Date.now() }); } catch (e) {}
  }
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
  releaseAdAudioDuck();
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



// ========== VOICE-OVER + PROGRAMME VIDEO FILTERS ==========
function applyProgramVideoFilters() {
  const f = (state.media && state.media.videoFilters) || { brightness: 100, contrast: 100, hue: 0, smooth: 0 };
  const filter = 'brightness(' + (f.brightness / 100) + ') contrast(' + (f.contrast / 100) + ') hue-rotate(' + f.hue + 'deg) blur(' + (Number(f.smooth) * 0.4) + 'px)';
  const canvas = document.getElementById('program-canvas');
  const content = document.getElementById('program-content');
  if (canvas) canvas.style.filter = filter;
  if (content) content.style.filter = filter;
}

function setVideoFilter(key, value) {
  if (!state.media.videoFilters) state.media.videoFilters = { brightness: 100, contrast: 100, hue: 0, smooth: 0 };
  const v = Number(value);
  state.media.videoFilters[key] = v;
  const map = { brightness: 'vf-brightness-val', contrast: 'vf-contrast-val', hue: 'vf-hue-val', smooth: 'vf-smooth-val' };
  const el = document.getElementById(map[key]);
  if (el) {
    if (key === 'hue') el.textContent = v + '°';
    else if (key === 'smooth') el.textContent = String(v);
    else el.textContent = v + '%';
  }
  applyProgramVideoFilters();
}

function resetVideoFilters() {
  state.media.videoFilters = { brightness: 100, contrast: 100, hue: 0, smooth: 0 };
  const defaults = { brightness: 100, contrast: 100, hue: 0, smooth: 0 };
  Object.keys(defaults).forEach(k => {
    const id = k === 'smooth' ? 'vf-smooth' : ('vf-' + k);
    const input = document.getElementById(id);
    if (input) input.value = defaults[k];
    setVideoFilter(k, defaults[k]);
  });
  audit('VIDEO_FILTER', 'reset');
}

async function toggleLiveVoiceOver() {
  const vo = state.media.voiceOver || (state.media.voiceOver = { live: false, stream: null, audioEl: null, level: 80, source: null });
  if (vo.live && vo.source === 'live') { stopVoiceOver(); return; }
  if (vo.live && vo.source === 'file') stopVoiceOver();
  try {
    let audioConstraints = { echoCancellation: true, noiseSuppression: true };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const ext = inputs.find(d => /usb|external|headset|wireless|boom|rode|blue|yeti/i.test(d.label || ''));
      if (ext && ext.deviceId) audioConstraints.deviceId = { ideal: ext.deviceId };
    } catch (e) {}
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    vo.stream = stream;
    vo.live = true;
    vo.source = 'live';
    try {
      if (!state.media._audioCtx) state.media._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = state.media._audioCtx;
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = (vo.level || 80) / 100;
      src.connect(gain);
      gain.connect(ctx.destination);
      vo._gain = gain;
      vo._sourceNode = src;
    } catch (e) { console.warn(e); }
    const btn = document.getElementById('vo-live-btn');
    if (btn) btn.textContent = 'Stop live VO';
    const st = document.getElementById('vo-status');
    if (st) st.textContent = 'Voice-over: LIVE mic on Programme';
    audit('VO_LIVE', 'start');
    if (typeof pushNotification === 'function') pushNotification('AUDIO', 'Live voice-over on', 'ok');
  } catch (err) {
    if (typeof pushNotification === 'function') pushNotification('AUDIO', 'VO mic failed: ' + (err.message || err), 'error');
  }
}

function stopVoiceOver() {
  const vo = state.media.voiceOver || {};
  if (vo.stream) { vo.stream.getTracks().forEach(t => t.stop()); vo.stream = null; }
  if (vo.audioEl) { try { vo.audioEl.pause(); vo.audioEl.src = ''; } catch (e) {} vo.audioEl = null; }
  try { if (vo._sourceNode) vo._sourceNode.disconnect(); if (vo._gain) vo._gain.disconnect(); } catch (e) {}
  vo._sourceNode = null; vo._gain = null; vo.live = false; vo.source = null;
  state.media.voiceOver = vo;
  const btn = document.getElementById('vo-live-btn');
  if (btn) btn.textContent = 'Start live VO';
  const st = document.getElementById('vo-status');
  if (st) st.textContent = 'Voice-over: off';
  audit('VO_STOP', 'stopped');
}

function setVoiceOverLevel(v) {
  if (!state.media.voiceOver) state.media.voiceOver = { live: false, level: 80 };
  const vo = state.media.voiceOver;
  vo.level = Math.max(0, Math.min(100, Number(v)));
  const label = document.getElementById('vo-level-val');
  if (label) label.textContent = String(vo.level);
  if (vo._gain) vo._gain.gain.value = vo.level / 100;
  if (vo.audioEl) vo.audioEl.volume = vo.level / 100;
}

function uploadVoiceOver(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  stopVoiceOver();
  if (!state.media.voiceOver) state.media.voiceOver = { live: false, level: 80 };
  const vo = state.media.voiceOver;
  const url = URL.createObjectURL(file);
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = (vo.level || 80) / 100;
  audio.play().catch(() => {});
  vo.audioEl = audio;
  vo.live = true;
  vo.source = 'file';
  const st = document.getElementById('vo-status');
  if (st) st.textContent = 'Voice-over: playing “' + file.name + '”';
  audit('VO_UPLOAD', file.name);
  if (typeof pushNotification === 'function') pushNotification('AUDIO', 'Uploaded VO playing', 'ok');
}




// ========== WATCH (Programme 16:9 mirror) ==========
let _watchBc = null;
let _watchPubTimer = null;

function ensureWatchPublisher(force) {
  try {
    if (!_watchBc) {
      _watchBc = new BroadcastChannel('bb-watch');
      _watchBc.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'viewer-hello') {
          state._watchViewerAt = Date.now();
        }
      };
    }
  } catch (e) { return; }
  const viewerRecent = (() => {
    try {
      const j = JSON.parse(localStorage.getItem('bb_watch_viewer') || 'null');
      return j && j.at && (Date.now() - j.at < 15000);
    } catch (e) { return false; }
  })();
  const need = force || viewerRecent || state.currentView === 'watch' || (state._watchViewerAt && Date.now() - state._watchViewerAt < 15000);
  if (!need) return;
  if (_watchPubTimer) return;
  _watchPubTimer = setInterval(publishWatchFrame, 200); // ~5 fps JPEG mirror
}

function publishWatchFrame() {
  const canvas = document.getElementById('program-canvas');
  if (!canvas || canvas.width < 16) return;
  const viewerRecent = (() => {
    try {
      const j = JSON.parse(localStorage.getItem('bb_watch_viewer') || 'null');
      return j && j.at && (Date.now() - j.at < 15000);
    } catch (e) { return false; }
  })();
  if (!viewerRecent && state.currentView !== 'watch' && !(state._watchViewerAt && Date.now() - state._watchViewerAt < 15000)) {
    if (_watchPubTimer) { clearInterval(_watchPubTimer); _watchPubTimer = null; }
    return;
  }
  let dataUrl = '';
  try {
    // Composite Program video + on-air graphics into one 16:9 JPEG for Watch
    const w = canvas.width, h = canvas.height;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ox = off.getContext('2d');
    ox.fillStyle = '#000';
    ox.fillRect(0, 0, w, h);
    ox.drawImage(canvas, 0, 0);
    // Bake visible HTML overlays from program-frame (logo, live, lower-third, clock, location)
    try {
      const frame = document.getElementById('program-frame');
      if (frame) {
        const nodes = frame.querySelectorAll('#gfx-location, #gfx-logo, #gfx-live, #gfx-breaking, #gfx-lowerthird, #gfx-clock, #gfx-ticker, #ad-overlay, #emergency-overlay, #hold-overlay');
        // Approximate: if lower-third host has content, draw solid green bar + text from state
        const g = state.graphics || {};
        if (g.live && g.live.enabled) {
          ox.fillStyle = '#dc2626';
          const pw = Math.max(48, w * 0.08), ph = Math.max(18, h * 0.045);
          ox.fillRect(w - pw - w * 0.025, h * 0.03, pw, ph);
          ox.fillStyle = '#fff';
          ox.font = 'bold ' + Math.round(h * 0.028) + 'px system-ui,sans-serif';
          ox.textAlign = 'center';
          ox.textBaseline = 'middle';
          ox.fillText('LIVE', w - pw / 2 - w * 0.025, h * 0.03 + ph / 2);
        }
        if (g.loc && g.loc.enabled && g.loc.text) {
          ox.fillStyle = 'rgba(0,0,0,0.72)';
          const tw = Math.min(w * 0.35, 12 + ox.measureText(g.loc.text).width);
          ox.fillRect(w * 0.02, h * 0.03, Math.max(80, w * 0.22), Math.max(18, h * 0.04));
          ox.fillStyle = '#fff';
          ox.font = 'bold ' + Math.round(h * 0.022) + 'px system-ui,sans-serif';
          ox.textAlign = 'left';
          ox.textBaseline = 'middle';
          ox.fillText(g.loc.text, w * 0.03, h * 0.03 + Math.max(18, h * 0.04) / 2);
        }
        if (g.lt && g.lt.enabled) {
          const barH = Math.max(28, h * 0.1);
          const barY = h - barH - h * 0.03;
          const title = g.lt.title || '';
          const sub = g.lt.subtitle || '';
          const ch = (g.logo && g.logo.text) || 'NEWS';
          ox.fillStyle = '#16a34a';
          ox.fillRect(w * 0.03, barY, w * 0.94, barH);
          ox.fillStyle = '#fff';
          ox.font = 'bold ' + Math.round(h * 0.032) + 'px system-ui,sans-serif';
          ox.textAlign = 'left';
          ox.textBaseline = 'middle';
          ox.fillText(ch + '  ' + title, w * 0.045, barY + barH * 0.38);
          if (sub) {
            ox.font = Math.round(h * 0.022) + 'px system-ui,sans-serif';
            ox.fillStyle = 'rgba(240,253,244,0.95)';
            ox.fillText(sub, w * 0.045, barY + barH * 0.72);
          }
        }
        if (g.clock && g.clock.enabled) {
          const now = new Date();
          const pad = n => String(n).padStart(2, '0');
          const t = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
          ox.fillStyle = 'rgba(0,0,0,0.55)';
          const cw = Math.max(56, w * 0.1), chh = Math.max(16, h * 0.035);
          ox.fillRect(w - cw - w * 0.03, h - chh - h * 0.035, cw, chh);
          ox.fillStyle = '#fff';
          ox.font = 'bold ' + Math.round(h * 0.022) + 'px ui-monospace,monospace';
          ox.textAlign = 'center';
          ox.textBaseline = 'middle';
          ox.fillText(t, w - cw / 2 - w * 0.03, h - chh / 2 - h * 0.035);
        }
      }
    } catch (e) {}
    dataUrl = off.toDataURL('image/jpeg', 0.78);
  } catch (e) {
    try { dataUrl = canvas.toDataURL('image/jpeg', 0.72); } catch (e2) { return; }
  }
  const primary = (typeof programPrimarySource === 'function') ? programPrimarySource() : null;
  const payload = {
    type: 'program-frame',
    dataUrl,
    live: state.broadcastState === 'live',
    w: canvas.width,
    h: canvas.height,
    at: Date.now(),
    sourceType: primary ? primary.type : null,
    youtubeId: (function () {
      const p = primary;
      if (p && p.type === 'youtube' && p.youtubeId) return p.youtubeId;
      if (state.programSlots) {
        for (let i = 0; i < state.programSlots.length; i++) {
          const s = typeof getSource === 'function' ? getSource(state.programSlots[i]) : null;
          if (s && s.type === 'youtube' && s.youtubeId) return s.youtubeId;
        }
      }
      return null;
    })(),
    sourceName: primary ? primary.name : null
  };
  try {
    if (_watchBc) _watchBc.postMessage(payload);
  } catch (e) {}
  try {
    // Fallback for other tabs when BroadcastChannel is restricted
    localStorage.setItem('bb_watch_frame', JSON.stringify({ dataUrl: dataUrl.slice(0, 1200000), live: payload.live, at: payload.at, w: payload.w, h: payload.h, youtubeId: payload.youtubeId || null }));
    try {
      if (payload.youtubeId) localStorage.setItem('bb_watch_yt', JSON.stringify({ id: payload.youtubeId, at: Date.now() }));
      else localStorage.removeItem('bb_watch_yt');
    } catch (e) {}
  } catch (e) {}
  updateWatchView(dataUrl, state.broadcastState === 'live');
}

function updateWatchView(dataUrl, live) {
  const img = document.getElementById('watch-frame-img');
  const empty = document.getElementById('watch-empty');
  const badge = document.getElementById('watch-live-badge');
  if (!img) return;
  if (!dataUrl) {
    const canvas = document.getElementById('program-canvas');
    if (canvas && canvas.width > 16) {
      try { dataUrl = canvas.toDataURL('image/jpeg', 0.72); } catch (e) {}
    }
  }
  if (dataUrl) {
    img.src = dataUrl;
    if (empty) empty.style.display = 'none';
  } else if (empty) {
    empty.style.display = 'flex';
  }
  if (badge) {
    const on = live || state.broadcastState === 'live';
    badge.classList.toggle('hidden', !on);
    badge.style.display = on ? 'inline-flex' : 'none';
  }
}




// ========== MOBILE / TABLET DIRECTOR (Module 16) ==========
let _dirBc = null;
let _dirStateTimer = null;

function ensureDirectorBridge() {
  try {
    if (!_dirBc && typeof BroadcastChannel !== 'undefined') {
      _dirBc = new BroadcastChannel('bb-director');
      _dirBc.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.type === 'director-hello') {
          state._directorAt = Date.now();
          publishDirectorState();
        }
        if (m.type === 'director-cmd') handleDirectorCommand(m);
      };
    }
  } catch (e) {}
  // Storage fallback for cmd
  window.addEventListener('storage', (e) => {
    if (e.key === 'bb_director_cmd' && e.newValue) {
      try {
        const m = JSON.parse(e.newValue);
        if (m && m.type === 'director-cmd') handleDirectorCommand(m);
      } catch (err) {}
    }
  });
  if (!_dirStateTimer) {
    _dirStateTimer = setInterval(() => {
      const recent = state._directorAt && (Date.now() - state._directorAt < 20000);
      let viewer = false;
      try {
        const j = JSON.parse(localStorage.getItem('bb_director_viewer') || 'null');
        viewer = j && j.at && (Date.now() - j.at < 15000);
      } catch (e) {}
      if (recent || viewer) publishDirectorState();
    }, 1000);
  }
}

function handleDirectorCommand(m) {
  const cmd = (m && m.cmd) || '';
  const payload = (m && m.payload) || {};
  audit('DIRECTOR_CMD', cmd);
  switch (cmd) {
    case 'take':
      if (typeof doTake === 'function') doTake();
      break;
    case 'cut':
      if (typeof doCut === 'function') doCut();
      break;
    case 'fade':
      if (typeof doFade === 'function') doFade();
      break;
    case 'black':
      if (typeof doBlack === 'function') doBlack();
      break;
    case 'hold':
      if (typeof doHold === 'function') doHold();
      break;
    case 'auto':
      if (typeof doAutoTransition === 'function') doAutoTransition();
      break;
    case 'emergency':
      if (typeof toggleEmergency === 'function') toggleEmergency();
      break;
    case 'broadcast_start':
      if (typeof startBroadcast === 'function') startBroadcast();
      break;
    case 'broadcast_stop':
      if (typeof stopBroadcast === 'function') stopBroadcast();
      break;
    case 'select_source':
      {
        const sid = (payload && (payload.id || payload.sourceId)) || '';
        if (sid && typeof selectSource === 'function') selectSource(sid);
      }
      break;
    case 'select_source':
      {
        const sid = (payload && (payload.id || payload.sourceId)) || '';
        if (sid && typeof selectSource === 'function') selectSource(sid);
      }
      break;
    case 'rundown_next':
      if (typeof rundownNext === 'function') rundownNext();
      break;
    case 'rundown_prev':
      if (typeof rundownPrev === 'function') rundownPrev();
      else if (typeof rundownBack === 'function') rundownBack();
      break;
    case 'preview':
      if (payload.sourceId && typeof setPreviewSource === 'function') setPreviewSource(payload.sourceId);
      else if (payload.sourceId && typeof selectPreview === 'function') selectPreview(payload.sourceId);
      else if (payload.sourceId) {
        // Fallback: set first preview slot
        const src = state.sources.find(s => s.id === payload.sourceId);
        if (src) {
          state.previewSlots = [payload.sourceId];
          if (typeof renderPreview === 'function') renderPreview();
          if (typeof renderSources === 'function') renderSources();
        }
      }
      break;
    default:
      break;
  }
  publishDirectorState();
  if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher(true);
}

function publishDirectorState() {
  let programFrame = '';
  let previewFrame = '';
  try {
    const canvas = document.getElementById('program-canvas');
    if (canvas && canvas.width > 16) programFrame = canvas.toDataURL('image/jpeg', 0.55);
  } catch (e) {}
  // Preview: try clone from preview content video
  try {
    const pv = document.querySelector('#preview-content video, #preview-frame video');
    if (pv && pv.videoWidth) {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 180;
      c.getContext('2d').drawImage(pv, 0, 0, 320, 180);
      previewFrame = c.toDataURL('image/jpeg', 0.5);
    }
  } catch (e) {}

  const pgmId = (state.programSlots && state.programSlots[0]) || '';
  const pvwId = (state.previewSlots && state.previewSlots[0]) || '';
  const pgmSrc = state.sources.find(s => s.id === pgmId);
  const playing = (state.rundown || []).find(r => r.status === 'Playing' || r.status === 'Paused');
  const next = (state.rundown || []).find(r => r.status === 'Upcoming');
  const timerEl = document.getElementById('timer');
  const payload = {
    type: 'director-state',
    broadcastState: state.broadcastState || 'offline',
    timer: timerEl ? timerEl.textContent : '00:00:00',
    programId: pgmId,
    previewId: pvwId,
    programLabel: pgmSrc ? pgmSrc.name : pgmId,
    rundownLabel: playing
      ? ('NOW: ' + playing.title + (next ? ' → ' + next.title : ''))
      : (next ? ('NEXT: ' + next.title) : 'Rundown idle'),
    sources: (state.sources || []).slice(0, 12).map(s => ({ id: s.id, name: s.name, type: s.type, status: s.status })),
    programFrame: programFrame,
    previewFrame: previewFrame,
    at: Date.now()
  };
  try {
    if (_dirBc) _dirBc.postMessage(payload);
  } catch (e) {}
}



// ===== Mobile / tablet nav =====
function isMobileLayout() {
  return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
}
function openMobileNav() {
  document.body.classList.add('nav-open');
  const bd = document.getElementById('sidebar-backdrop');
  if (bd) bd.classList.add('show');
}
function closeMobileNav() {
  document.body.classList.remove('nav-open');
  const bd = document.getElementById('sidebar-backdrop');
  if (bd) bd.classList.remove('show');
}
function toggleMobileNav() {
  if (document.body.classList.contains('nav-open')) closeMobileNav();
  else openMobileNav();
}
window.openMobileNav = openMobileNav;
window.closeMobileNav = closeMobileNav;
window.toggleMobileNav = toggleMobileNav;

// Close drawer after navigating on mobile
(function patchNavigateForMobile() {
  const prev = window.navigateTo;
  if (typeof prev !== 'function') return;
  window.navigateTo = function (id) {
    prev(id);
    if (isMobileLayout()) closeMobileNav();
    else if (typeof ensureSidebarVisible === 'function') ensureSidebarVisible();
  };
  // also keep named function in sync if used
  if (typeof navigateTo === 'function') {
    const _n = navigateTo;
    // navigateTo may be function declaration — reassign window only is enough for onclick
  }
})();

window.addEventListener('resize', function () {
  if (!isMobileLayout()) closeMobileNav();
  if (typeof sizeMonitorFrames === 'function') sizeMonitorFrames();
  if (typeof renderHardwareDevicePanels === 'function' && document.getElementById('hw-video-list')) renderHardwareDevicePanels();
});


function renderMobileSourceStrip() {
  const el = document.getElementById('mobile-source-strip');
  if (!el) return;
  const pv = (state.previewSlots && state.previewSlots[0]) || null;
  const pg = (state.programSlots && state.programSlots[0]) || null;
  el.innerHTML = (state.sources || []).slice(0, 12).map(s => {
    const active = s.id === pv ? ' active' : '';
    const onP = s.id === pg ? ' on-program' : '';
    const label = (s.name || s.id).length > 18 ? (s.name || s.id).slice(0, 16) + '…' : (s.name || s.id);
    return '<button type="button" class="' + active + onP + '" onclick="selectSource(\'' + s.id + '\')">' + label + '</button>';
  }).join('');
}


// ========== BACKGROUND / PiP / WAKE LOCK (cross-device) ==========
// Browsers limit true background camera; we keep compositor alive, support
// Picture-in-Picture (over other apps), Media Session, and screen Wake Lock.

function ensurePipVideo() {
  let v = document.getElementById('program-pip-video');
  if (!v) {
    v = document.createElement('video');
    v.id = 'program-pip-video';
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0;z-index:-1';
    document.body.appendChild(v);
  }
  return v;
}

function bindProgramStreamToPipVideo() {
  const canvas = document.getElementById('program-canvas');
  const v = ensurePipVideo();
  if (!canvas || canvas.width < 16) return null;
  try {
    const stream = canvas.captureStream(30);
    // Prefer Program video; add local audio for background continuity when allowed
    if (state.media && state.media.localStream) {
      state.media.localStream.getAudioTracks().forEach(t => {
        try { stream.addTrack(t); } catch (e) {}
      });
    }
    if (v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
    state.media._pipStream = stream;
    return v;
  } catch (e) {
    console.warn('PiP stream', e);
    return null;
  }
}

async function toggleProgramPiP() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      audit('PIP', 'exit');
      return;
    }
    // YouTube-on-Program: try iframe PiP is not available; use canvas/stream path for local sources
    const primary = typeof programPrimarySource === 'function' ? programPrimarySource() : null;
    if (primary && primary.type === 'youtube' && primary.youtubeId) {
      // Open Watch in a small window as fallback "over apps" path
      if (typeof appPageUrl === 'function') {
        const url = appPageUrl('watch.html');
        window.open(url, 'bb_watch_pip', 'width=480,height=270,menubar=no,toolbar=no,location=no,status=no');
        if (typeof pushNotification === 'function') pushNotification('PiP', 'YouTube: opened Watch window (iframe PiP blocked by browser)', 'info');
      }
      return;
    }
    const v = bindProgramStreamToPipVideo();
    if (!v) {
      if (typeof pushNotification === 'function') pushNotification('PiP', 'Program stream not ready — TAKE a camera/media source', 'warn');
      return;
    }
    if (!document.pictureInPictureEnabled) {
      if (typeof pushNotification === 'function') pushNotification('PiP', 'Picture-in-Picture not supported on this device', 'warn');
      return;
    }
    await v.requestPictureInPicture();
    audit('PIP', 'enter Program');
    if (typeof pushNotification === 'function') pushNotification('PiP', 'Programme playing over other apps', 'ok');
    setupMediaSession();
    requestBroadcastWakeLock();
  } catch (err) {
    if (typeof pushNotification === 'function') pushNotification('PiP', err.message || String(err), 'error');
  }
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    const title = (state.graphics && state.graphics.lt && state.graphics.lt.title) || 'Broadcast Brilliance';
    const artist = (state.graphics && state.graphics.logo && state.graphics.logo.text) || 'On Air';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: artist,
      album: 'Programme',
      artwork: [{ src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#2563eb"/><text x="64" y="84" text-anchor="middle" font-size="56" font-family="system-ui" font-weight="900" fill="white">BB</text></svg>'), sizes: '128x128', type: 'image/svg+xml' }]
    });
    navigator.mediaSession.playbackState = (state.broadcastState === 'live' || (state.media && state.media.recording)) ? 'playing' : 'paused';
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        const v = document.getElementById('program-pip-video');
        if (v) v.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        /* keep program running — do not pause production */
      });
    } catch (e) {}
  } catch (e) {}
}

async function requestBroadcastWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    if (state.media._wakeLock) {
      try { await state.media._wakeLock.release(); } catch (e) {}
      state.media._wakeLock = null;
    }
    state.media._wakeLock = await navigator.wakeLock.request('screen');
    state.media._wakeLock.addEventListener('release', () => { state.media._wakeLock = null; });
  } catch (e) {
    // unsupported or denied — ignore
  }
}

function releaseBroadcastWakeLock() {
  try {
    if (state.media && state.media._wakeLock) {
      state.media._wakeLock.release();
      state.media._wakeLock = null;
    }
  } catch (e) {}
}

function enableBackgroundPlayback() {
  // Keep compositor + media playing when tab is hidden (as far as browser allows)
  if (state.media._bgHooks) return;
  state.media._bgHooks = true;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab in background — keep RAF compositor, Watch publisher, and media elements alive
      if (state.media && state.media.compositorActive && !state.media.animFrame) {
        if (typeof compositeLoop === 'function') compositeLoop();
      }
      if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher(true);
      // Resume any program media elements
      document.querySelectorAll('#program-content video, #local-cam-video, video[id^="comp-media-"]').forEach(v => {
        try { if (v.paused) v.play().catch(() => {}); } catch (e) {}
      });
      const pip = document.getElementById('program-pip-video');
      if (pip && pip.paused) pip.play().catch(() => {});
      setupMediaSession();
    } else {
      if (typeof sizeMonitorFrames === 'function') sizeMonitorFrames();
  if (typeof renderHardwareDevicePanels === 'function' && document.getElementById('hw-video-list')) renderHardwareDevicePanels();
      if (typeof resizeProgramCanvas === 'function') resizeProgramCanvas();
    }
  });

  // iOS / mobile: unlock audio context on first gesture
  const unlock = () => {
    try {
      if (!state.media._audioCtx) state.media._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (state.media._audioCtx.state === 'suspended') state.media._audioCtx.resume();
    } catch (e) {}
    document.removeEventListener('touchstart', unlock);
    document.removeEventListener('click', unlock);
  };
  document.addEventListener('touchstart', unlock, { once: true, passive: true });
  document.addEventListener('click', unlock, { once: true });

  // Re-acquire wake lock after resume
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (state.broadcastState === 'live' || (state.media && state.media.recording))) {
      requestBroadcastWakeLock();
    }
  });
}

window.toggleProgramPiP = toggleProgramPiP;
window.enableBackgroundPlayback = enableBackgroundPlayback;


// ========== BACKGROUND / OVER-APPS PLAYBACK ==========
// Browsers cannot run arbitrary UI over other apps. Practical tools:
// 1) Picture-in-Picture (floats video over other apps)
// 2) Media Session (lock-screen / headset controls)
// 3) Screen Wake Lock (keep screen on while live)
// 4) Do not auto-pause Program when the tab is hidden

let _wakeLock = null;
let _bgPipVideo = null;

function setupBackgroundPlayback() {
  // Keep intentional media running when tab is backgrounded
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      try {
        if (state.media && state.media._audioCtx && state.media._audioCtx.state === 'suspended') {
          state.media._audioCtx.resume().catch(function () {});
        }
      } catch (e) {}
      // Resume local preview elements if needed
      try {
        var lv = document.getElementById('local-cam-video');
        if (lv && lv.paused && state.media && state.media.localStream) lv.play().catch(function () {});
      } catch (e) {}
      if (typeof ensureWatchPublisher === 'function') ensureWatchPublisher();
      if (typeof requestBroadcastWakeLock === 'function') requestBroadcastWakeLock();
    }
  });

  // Media Session — continues to surface "now playing" while backgrounded
  try {
    if (navigator.mediaSession) {
      navigator.mediaSession.setActionHandler('play', function () {
        if (typeof startBroadcast === 'function' && state.broadcastState !== 'live') startBroadcast();
      });
      navigator.mediaSession.setActionHandler('pause', function () {
        // Do not auto-stop broadcast on lock-screen pause unless operator wants — no-op
      });
    }
  } catch (e) {}

  updateMediaSessionMetadata();
}

function updateMediaSessionMetadata() {
  try {
    if (!navigator.mediaSession) return;
    var title = 'Broadcast Brilliance';
    var artist = 'Programme';
    if (state.broadcastState === 'live') {
      title = 'ON AIR · Broadcast Brilliance';
    }
    var primary = (typeof programPrimarySource === 'function') ? programPrimarySource() : null;
    if (primary && primary.name) artist = primary.name;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: artist,
      album: 'Studio',
      artwork: [{ src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#2563eb"/><text x="64" y="84" text-anchor="middle" font-size="56" font-family="system-ui" font-weight="900" fill="white">BB</text></svg>'), sizes: '128x128', type: 'image/svg+xml' }]
    });
    navigator.mediaSession.playbackState = (state.broadcastState === 'live' || (state.media && state.media.recording)) ? 'playing' : 'paused';
  } catch (e) {}
}

async function requestBroadcastWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    var need = state.broadcastState === 'live' || (state.media && state.media.recording) || (state.media && state.media.voiceOver && state.media.voiceOver.live);
    if (!need) {
      if (_wakeLock) { try { await _wakeLock.release(); } catch (e) {} _wakeLock = null; }
      return;
    }
    if (_wakeLock) return;
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', function () { _wakeLock = null; });
  } catch (e) {
    _wakeLock = null;
  }
}

function ensureBgPipVideo() {
  if (_bgPipVideo && document.body.contains(_bgPipVideo)) return _bgPipVideo;
  var v = document.createElement('video');
  v.id = 'bb-bg-pip-video';
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.setAttribute('playsinline', '');
  v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0;z-index:-1';
  document.body.appendChild(v);
  _bgPipVideo = v;
  return v;
}

async function startProgramPiP() {
  // Float Programme over other apps (browser Picture-in-Picture)
  var canvas = document.getElementById('program-canvas');
  if (!canvas) {
    if (typeof pushNotification === 'function') pushNotification('PiP', 'Program canvas not ready', 'warn');
    return;
  }
  if (!document.pictureInPictureEnabled) {
    if (typeof pushNotification === 'function') pushNotification('PiP', 'Picture-in-Picture not supported in this browser', 'warn');
    return;
  }
  try {
    // If YouTube iframe is on Program, try document PiP of the program frame via canvas stream
    var v = ensureBgPipVideo();
    if (v.captureStream || canvas.captureStream) {
      var stream = canvas.captureStream(30);
      v.srcObject = stream;
      await v.play();
      if (document.pictureInPictureElement === v) {
        await document.exitPictureInPicture();
        if (typeof pushNotification === 'function') pushNotification('PiP', 'Picture-in-Picture closed', 'info');
        return;
      }
      await v.requestPictureInPicture();
      updateMediaSessionMetadata();
      if (typeof pushNotification === 'function') pushNotification('PiP', 'Programme floating over other apps', 'ok');
      audit('PIP', 'Program PiP started');
    }
  } catch (err) {
    if (typeof pushNotification === 'function') pushNotification('PiP', 'Could not start PiP: ' + (err.message || err), 'error');
  }
}

window.startProgramPiP = startProgramPiP;
window.requestBroadcastWakeLock = requestBroadcastWakeLock;
window.updateMediaSessionMetadata = updateMediaSessionMetadata;

// INIT
// Capture-phase delegation — always works even if button nodes are replaced
window.navigateTo = navigateTo;
if (!window.__bbNavDelegate) {
  window.__bbNavDelegate = true;
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    var btn = t.closest ? t.closest('[data-nav]') : null;
    if (!btn || !btn.closest || !btn.closest('#nav, .app-sidebar')) return;
    var id = btn.getAttribute('data-nav');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    navigateTo(id);
  }, true);
}
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
if (typeof loadGraphicsFromStorage === 'function') loadGraphicsFromStorage();
if (typeof loadRundownFromStorage === 'function') loadRundownFromStorage();
applyGraphicsToProgram(); Object.keys(state.graphics).forEach(updateToggleUI); syncGfxEditors();
if (typeof renderRundownTable === 'function') renderRundownTable();
if (typeof applyRoleGates === 'function') applyRoleGates();
if (typeof updateNewsDirectorUI === 'function') updateNewsDirectorUI();
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
  if (state.currentView === 'home' && typeof renderHomeDashboard === 'function') renderHomeDashboard();
  if (state.currentView === 'news') renderNewsDirectorPage();
    if (state.currentView === 'guests' && typeof refreshJoinInbox === 'function') refreshJoinInbox();
  if (!state.itemPaused && getPlayingItem()) {
    state.itemRemaining--;
    if (state.itemRemaining === 5 && state.autoDirector) {
      if (typeof pushNotification === 'function') pushNotification('AUTO', '5s to next rundown item', 'warn');
      if (typeof setSwitcherStatus === 'function') setSwitcherStatus('AUTO: 5s…', 'warn');
    }
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
  } else if (key === 'a' || key === 'A') {
    e.preventDefault();
    if (typeof doAutoTransition === 'function') doAutoTransition();
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

if (typeof sizeMonitorFrames === "function") {
  sizeMonitorFrames();
  setTimeout(sizeMonitorFrames, 100);
  setTimeout(sizeMonitorFrames, 400);
}


// ----- Keep awake / background play toggle -----
state.media = state.media || {};
state.media.keepAwake = false;

async function toggleKeepAwake() {
  state.media.keepAwake = !state.media.keepAwake;
  const btn = document.getElementById('btn-keep-awake');
  if (state.media.keepAwake) {
    await requestBroadcastWakeLock();
    setupMediaSession();
    if (typeof enableBackgroundPlayback === 'function') enableBackgroundPlayback();
    if (btn) {
      btn.textContent = 'On air lock';
      btn.className = 'px-2 py-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-[10px] font-bold border border-emerald-500';
    }
    if (typeof pushNotification === 'function') pushNotification('BG', 'Keep-on enabled: screen wake + background media', 'ok');
    audit('KEEP_AWAKE', 'on');
  } else {
    releaseBroadcastWakeLock();
    if (btn) {
      btn.textContent = 'Keep on';
      btn.className = 'px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold border border-slate-600';
    }
    audit('KEEP_AWAKE', 'off');
  }
}
window.toggleKeepAwake = toggleKeepAwake;

// Auto-enable background hooks once
(function initBackgroundPlay() {
  function boot() {
    try {
      if (typeof enableBackgroundPlayback === 'function') enableBackgroundPlayback();
      if (typeof setupBackgroundPlayback === 'function') setupBackgroundPlayback();
      if (typeof setupMediaSession === 'function') setupMediaSession();
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


// ========== HARDWARE DEVICES (Sources — real MediaDevices) ==========
state.media = state.media || {};
state.media.deviceStreams = state.media.deviceStreams || {}; // deviceId -> MediaStream
state.media.audioStreams = state.media.audioStreams || {};
state.media.audioMeters = state.media.audioMeters || {}; // deviceId -> {ctx, analyser, data, level, raf}
state.media.hwDevices = state.media.hwDevices || { video: [], audio: [], perm: 'unknown', error: '' };
state.media.activeAudioDeviceId = state.media.activeAudioDeviceId || null;
state.media.audioMuted = !!state.media.audioMuted;

function classifyVideoDevice(label) {
  const l = (label || '').toLowerCase();
  if (/capture|hdmi|sdi|uvc|elgato|cam link|intensity|decklink|magewell|avermedia/.test(l)) return 'Capture device';
  if (/back|rear|environment/.test(l)) return 'Rear camera';
  if (/front|user|face/.test(l)) return 'Front camera';
  if (/webcam|usb|camera|integrated|facetime|hd camera/.test(l)) return 'USB / built-in camera';
  return 'Video input';
}
function classifyAudioDevice(label) {
  const l = (label || '').toLowerCase();
  if (/mixer|interface|scarlett|focusrite|behringer|xlr|studio/.test(l)) return 'Audio interface / mixer';
  if (/usb/.test(l)) return 'USB microphone / interface';
  if (/default|communications|microphone|mic/.test(l)) return 'Microphone';
  return 'Audio input';
}

function setHwPermMsg(text, kind) {
  const el = document.getElementById('hw-perm-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'text-[10px] mb-2 min-h-[16px] ' + (
    kind === 'ok' ? 'text-green-400' : kind === 'err' ? 'text-red-400' : kind === 'warn' ? 'text-amber-400' : 'text-slate-500'
  );
}

async function requestMediaPermissions() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setHwPermMsg('Media devices API not available in this browser.', 'err');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    // Permission probe only — stop tracks; full use is via Use Source
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    state.media.hwDevices.perm = 'granted';
    setHwPermMsg('Camera & microphone permission granted. Refreshing devices…', 'ok');
    await refreshMediaDevices();
    if (typeof audit === 'function') audit('HW_PERM', 'granted');
  } catch (err) {
    const name = (err && err.name) || '';
    state.media.hwDevices.perm = 'denied';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      setHwPermMsg('Permission denied or dismissed. Allow camera & microphone in the browser address bar, then try again.', 'err');
    } else if (name === 'NotFoundError') {
      setHwPermMsg('No camera or microphone found on this device.', 'warn');
      state.media.hwDevices.perm = 'granted';
      await refreshMediaDevices();
    } else if (name === 'NotReadableError') {
      setHwPermMsg('Device in use by another application. Close other apps using the camera/mic, then Refresh Devices.', 'err');
    } else {
      setHwPermMsg('Permission error: ' + (err.message || name || String(err)), 'err');
    }
    if (typeof pushNotification === 'function') pushNotification('Devices', 'Media permission issue — see Sources panel', 'warn');
  }
}

async function refreshMediaDevices() {
  const listV = document.getElementById('hw-video-list');
  const listA = document.getElementById('hw-audio-list');
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    setHwPermMsg('enumerateDevices is not supported in this browser.', 'err');
    if (listV) listV.innerHTML = '<div class="text-slate-500 text-[10px]">Unsupported</div>';
    if (listA) listA.innerHTML = '<div class="text-slate-500 text-[10px]">Unsupported</div>';
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(function (d) { return d.kind === 'videoinput'; });
    const audios = devices.filter(function (d) { return d.kind === 'audioinput'; });
    const labelsHidden = videos.every(function (d) { return !d.label; }) && audios.every(function (d) { return !d.label; });
    if (labelsHidden) {
      state.media.hwDevices.perm = state.media.hwDevices.perm === 'granted' ? 'granted' : 'prompt';
      setHwPermMsg('Device labels hidden until permission is granted. Click “Allow Camera & Microphone”.', 'warn');
    } else if (state.media.hwDevices.perm !== 'denied') {
      state.media.hwDevices.perm = 'granted';
      setHwPermMsg(videos.length + ' video · ' + audios.length + ' audio input(s) detected.', 'ok');
    }
    state.media.hwDevices.video = videos.map(function (d, i) {
      const stream = state.media.deviceStreams[d.deviceId];
      const live = !!(stream && stream.getVideoTracks().some(function (t) { return t.readyState === 'live'; }));
      return {
        deviceId: d.deviceId,
        label: d.label || ('Camera ' + (i + 1)),
        type: classifyVideoDevice(d.label),
        status: live ? 'Connected' : (d.deviceId ? 'Available' : 'Permission Required'),
        groupId: d.groupId
      };
    });
    state.media.hwDevices.audio = audios.map(function (d, i) {
      const stream = state.media.audioStreams[d.deviceId];
      const live = !!(stream && stream.getAudioTracks().some(function (t) { return t.readyState === 'live'; }));
      return {
        deviceId: d.deviceId,
        label: d.label || ('Microphone ' + (i + 1)),
        type: classifyAudioDevice(d.label),
        status: live ? 'Connected' : (d.deviceId ? 'Available' : 'Permission Required'),
        groupId: d.groupId
      };
    });
    // Prune disconnected streams
    Object.keys(state.media.deviceStreams).forEach(function (id) {
      const still = videos.some(function (d) { return d.deviceId === id; });
      if (!still) {
        try { state.media.deviceStreams[id].getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        delete state.media.deviceStreams[id];
      }
    });
    Object.keys(state.media.audioStreams).forEach(function (id) {
      const still = audios.some(function (d) { return d.deviceId === id; });
      if (!still) {
        stopAudioMeter(id);
        try { state.media.audioStreams[id].getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        delete state.media.audioStreams[id];
      }
    });
    renderHardwareDevicePanels();
    if (typeof audit === 'function') audit('HW_REFRESH', videos.length + 'v/' + audios.length + 'a');
  } catch (err) {
    setHwPermMsg('Could not list devices: ' + (err.message || err), 'err');
  }
}

function renderHardwareDevicePanels() {
  const listV = document.getElementById('hw-video-list');
  const listA = document.getElementById('hw-audio-list');
  if (listV) {
    const items = state.media.hwDevices.video || [];
    if (!items.length) {
      listV.innerHTML = '<div class="text-slate-500 text-[10px] py-2">No video inputs reported. Grant permission or connect a UVC / capture device.</div>';
    } else {
      listV.innerHTML = items.map(function (d) {
        const live = d.status === 'Connected';
        const statusCls = live ? 'text-green-400' : (d.status === 'Permission Required' ? 'text-amber-400' : 'text-slate-400');
        const active = (state.sources || []).some(function (s) { return s.deviceId === d.deviceId && (state.programSlots || []).indexOf(s.id) >= 0; });
        return '<div class="rounded border border-[#1e2a3a] bg-[#131a28] p-2" data-hw-vid="' + d.deviceId + '">' +
          '<div class="flex items-start justify-between gap-2 mb-1">' +
            '<div class="min-w-0">' +
              '<div class="text-[11px] font-semibold text-white truncate">' + d.label + '</div>' +
              '<div class="text-[9px] text-slate-500">' + d.type + '</div>' +
              '<div class="text-[9px] ' + statusCls + '">● ' + d.status + (active ? ' · ON PROGRAM' : '') + '</div>' +
              '<div class="text-[9px] text-slate-600" id="hw-vid-meta-' + cssEsc(d.deviceId) + '">—</div>' +
            '</div>' +
            '<div class="flex flex-col gap-1 shrink-0">' +
              '<button type="button" onclick="useHardwareVideoSource(\'' + d.deviceId.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-cyan-900 hover:bg-cyan-800 text-cyan-100 text-[9px] font-bold">Use</button>' +
              '<button type="button" onclick="hwVideoToPreview(\'' + d.deviceId.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white text-[9px] font-bold">PVW</button>' +
              '<button type="button" onclick="hwVideoTake(\'' + d.deviceId.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-green-700 hover:bg-green-600 text-white text-[9px] font-bold">TAKE</button>' +
              '<button type="button" onclick="hwVideoCut(\'' + d.deviceId.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[9px] font-bold">CUT</button>' +
              '<button type="button" onclick="hwVideoFade(\'' + d.deviceId.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-indigo-800 hover:bg-indigo-700 text-white text-[9px] font-bold">FADE</button>' +
            '</div>' +
          '</div>' +
          '<div class="relative bg-black rounded overflow-hidden" style="aspect-ratio:16/9">' +
            '<video id="hw-prev-' + cssEsc(d.deviceId) + '" class="w-full h-full object-contain" autoplay playsinline muted></video>' +
            (!live ? '<div class="absolute inset-0 flex items-center justify-center text-[9px] text-slate-600">Preview after Use Source</div>' : '') +
          '</div></div>';
      }).join('');
      // Attach previews for live streams
      items.forEach(function (d) {
        const stream = state.media.deviceStreams[d.deviceId];
        const v = document.getElementById('hw-prev-' + cssEsc(d.deviceId));
        if (v && stream) {
          try { v.srcObject = stream; v.play().catch(function () {}); } catch (e) {}
          const track = stream.getVideoTracks()[0];
          const settings = track && track.getSettings ? track.getSettings() : {};
          const meta = document.getElementById('hw-vid-meta-' + cssEsc(d.deviceId));
          if (meta) {
            const res = (settings.width && settings.height) ? (settings.width + '×' + settings.height) : '—';
            const fps = settings.frameRate ? (Math.round(settings.frameRate) + ' fps') : '';
            meta.textContent = res + (fps ? ' · ' + fps : '');
          }
        }
      });
    }
  }
  if (listA) {
    const items = state.media.hwDevices.audio || [];
    if (!items.length) {
      listA.innerHTML = '<div class="text-slate-500 text-[10px] py-2">No audio inputs reported. Grant permission or connect a USB mic / interface.</div>';
    } else {
      listA.innerHTML = items.map(function (d) {
        const live = d.status === 'Connected';
        const statusCls = live ? 'text-green-400' : (d.status === 'Permission Required' ? 'text-amber-400' : 'text-slate-400');
        const isActive = state.media.activeAudioDeviceId === d.deviceId;
        const muted = !!state.media.audioMuted && isActive;
        return '<div class="rounded border border-[#1e2a3a] bg-[#131a28] p-2" data-hw-aud="' + d.deviceId + '">' +
          '<div class="flex items-start justify-between gap-2 mb-1">' +
            '<div class="min-w-0">' +
              '<div class="text-[11px] font-semibold text-white truncate">' + d.label + '</div>' +
              '<div class="text-[9px] text-slate-500">' + d.type + '</div>' +
              '<div class="text-[9px] ' + statusCls + '">● ' + d.status + (isActive ? ' · ACTIVE' : '') + '</div>' +
              '<div class="text-[9px] text-slate-600" id="hw-aud-meta-' + cssEsc(d.deviceId) + '">—</div>' +
            '</div>' +
            '<div class="flex flex-col gap-1 shrink-0">' +
              '<button type="button" onclick="useHardwareAudioSource(\'' + d.deviceId.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-green-800 hover:bg-green-700 text-white text-[9px] font-bold">Use Source</button>' +
              '<button type="button" onclick="toggleHardwareAudioMute(\'' + d.deviceId.replace(/'/g, "\\'") + '\')" class="px-2 py-1 rounded bg-[#1e2a3a] text-slate-200 text-[9px] font-semibold">' + (muted ? 'Unmute' : 'Mute') + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="h-2 rounded bg-[#0a0e17] overflow-hidden border border-[#1e2a3a]">' +
            '<div id="hw-meter-' + cssEsc(d.deviceId) + '" class="h-full bg-amber-500 transition-all duration-75" style="width:0%"></div>' +
          '</div>' +
          (isActive ? '<div class="mt-1 flex items-center gap-2"><span class="text-[9px] text-slate-500">Vol</span><input type="range" min="0" max="100" value="' + Math.round((state.media.localAudioGain != null ? state.media.localAudioGain : 1) * 100) + '" oninput="setHardwareAudioGain(this.value)" class="flex-1" /></div>' : '') +
          '</div>';
      }).join('');
      items.forEach(function (d) {
        if (state.media.audioStreams[d.deviceId]) startAudioMeter(d.deviceId);
      });
    }
  }
}

function cssEsc(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function useHardwareVideoSource(deviceId) {
  if (!deviceId || !navigator.mediaDevices) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    // Stop previous stream for this deviceId if any
    if (state.media.deviceStreams[deviceId]) {
      try { state.media.deviceStreams[deviceId].getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    }
    state.media.deviceStreams[deviceId] = stream;
    const track = stream.getVideoTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : {};
    const label = (state.media.hwDevices.video.find(function (d) { return d.deviceId === deviceId; }) || {}).label || track.label || 'Camera';
    const res = (settings.width && settings.height) ? (settings.width + '×' + settings.height) : '—';

    // Map into Source Engine — reuse cam1 for first device or dedicated id
    let srcId = 'cam_' + cssEsc(deviceId).slice(0, 12);
    let src = state.sources.find(function (s) { return s.deviceId === deviceId; });
    if (!src) {
      // Prefer filling cam1 if free / same device
      const cam1 = state.sources.find(function (s) { return s.id === 'cam1'; });
      if (cam1 && (!cam1.deviceId || cam1.deviceId === deviceId || !cam1.hasStream)) {
        src = cam1;
        srcId = 'cam1';
      } else {
        src = {
          id: srcId,
          name: label,
          type: 'camera',
          status: 'live',
          res: res,
          role: 'Local HW',
          color: '#0369a1',
          icon: '📷',
          hasStream: true,
          deviceId: deviceId
        };
        state.sources.push(src);
      }
    }
    src.id = src.id || srcId;
    src.name = label;
    src.type = 'camera';
    src.status = 'live';
    src.hasStream = true;
    src.deviceId = deviceId;
    src.res = res;
    src.role = 'Local HW';

    // Primary local pipeline compatibility: if cam1, also set localStream + local-cam-video
    if (src.id === 'cam1') {
      if (state.media.localStream && state.media.localStream !== stream) {
        try {
          state.media.localStream.getVideoTracks().forEach(function (t) { t.stop(); });
        } catch (e) {}
      }
      // Merge: keep audio tracks from previous localStream if any
      const audioTracks = (state.media.localStream && state.media.localStream.getAudioTracks()) || [];
      const merged = new MediaStream([].concat(stream.getVideoTracks(), audioTracks));
      state.media.localStream = merged;
      const v = document.getElementById('local-cam-video');
      if (v) {
        v.srcObject = merged;
        v.play().catch(function () {});
      }
      if (!state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
      updateMediaStatusLabels();
    }

    // Put on Preview
    if (typeof selectSource === 'function') selectSource(src.id);
    stream.getVideoTracks().forEach(function (t) {
      t.addEventListener('ended', function () {
        src.status = 'Disconnected';
        src.hasStream = false;
        delete state.media.deviceStreams[deviceId];
        refreshMediaDevices();
        if (typeof renderSourcesPage === 'function') renderSourcesPage();
      });
    });
    await refreshMediaDevices();
    if (typeof renderSourcesPage === 'function') renderSourcesPage();
    if (typeof renderSources === 'function') renderSources();
    if (typeof renderPreview === 'function') renderPreview();
    if (typeof pushNotification === 'function') pushNotification('Sources', label + ' ready — on Preview. TAKE to Program.', 'ok');
    if (typeof audit === 'function') audit('HW_VIDEO_USE', label);
  } catch (err) {
    const name = (err && err.name) || '';
    let msg = err.message || String(err);
    if (name === 'NotAllowedError') msg = 'Permission denied for this camera.';
    else if (name === 'NotReadableError') msg = 'Device in use or unavailable.';
    else if (name === 'OverconstrainedError') msg = 'Device does not support the requested constraints.';
    else if (name === 'NotFoundError') msg = 'Device not found — it may have been disconnected.';
    setHwPermMsg(msg, 'err');
    if (typeof pushNotification === 'function') pushNotification('Sources', msg, 'error');
  }
}

async function useHardwareAudioSource(deviceId) {
  if (!deviceId || !navigator.mediaDevices) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
      video: false
    });
    if (state.media.audioStreams[deviceId]) {
      try { state.media.audioStreams[deviceId].getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      stopAudioMeter(deviceId);
    }
    state.media.audioStreams[deviceId] = stream;
    state.media.activeAudioDeviceId = deviceId;
    const track = stream.getAudioTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : {};
    const label = (state.media.hwDevices.audio.find(function (d) { return d.deviceId === deviceId; }) || {}).label || track.label || 'Microphone';

    // Integrate with existing localStream audio for recording / Program
    if (state.media.localStream) {
      state.media.localStream.getAudioTracks().forEach(function (t) {
        try { state.media.localStream.removeTrack(t); t.stop(); } catch (e) {}
      });
      stream.getAudioTracks().forEach(function (t) {
        try { state.media.localStream.addTrack(t); } catch (e) {}
      });
    } else {
      // Hold audio-only as localStream until video arrives
      state.media.localStream = stream;
    }
    if (typeof applyLocalAudioGain === 'function') applyLocalAudioGain();
    startAudioMeter(deviceId);
    const meta = document.getElementById('hw-aud-meta-' + cssEsc(deviceId));
    if (meta) {
      meta.textContent = settings.sampleRate ? (settings.sampleRate + ' Hz') : 'Live';
    }
    await refreshMediaDevices();
    if (typeof pushNotification === 'function') pushNotification('Sources', 'Audio: ' + label, 'ok');
    if (typeof audit === 'function') audit('HW_AUDIO_USE', label);
  } catch (err) {
    const name = (err && err.name) || '';
    let msg = err.message || String(err);
    if (name === 'NotAllowedError') msg = 'Permission denied for microphone.';
    else if (name === 'NotReadableError') msg = 'Audio device in use or unavailable.';
    else if (name === 'NotFoundError') msg = 'Audio device not found.';
    setHwPermMsg(msg, 'err');
    if (typeof pushNotification === 'function') pushNotification('Sources', msg, 'error');
  }
}

function toggleHardwareAudioMute(deviceId) {
  if (state.media.activeAudioDeviceId !== deviceId) {
    useHardwareAudioSource(deviceId);
    return;
  }
  state.media.audioMuted = !state.media.audioMuted;
  const stream = state.media.audioStreams[deviceId];
  if (stream) {
    stream.getAudioTracks().forEach(function (t) { t.enabled = !state.media.audioMuted; });
  }
  if (state.media.localStream) {
    state.media.localStream.getAudioTracks().forEach(function (t) { t.enabled = !state.media.audioMuted; });
  }
  renderHardwareDevicePanels();
  if (typeof audit === 'function') audit('HW_AUDIO_MUTE', state.media.audioMuted ? 'muted' : 'unmuted');
}

function setHardwareAudioGain(pct) {
  const g = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
  state.media.localAudioGain = g;
  if (typeof applyLocalAudioGain === 'function') applyLocalAudioGain();
}

function startAudioMeter(deviceId) {
  const stream = state.media.audioStreams[deviceId];
  if (!stream) return;
  stopAudioMeter(deviceId);
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    state.media.audioMeters[deviceId] = { ctx: ctx, analyser: analyser, data: data, raf: null };
    function tick() {
      const m = state.media.audioMeters[deviceId];
      if (!m) return;
      m.analyser.getByteFrequencyData(m.data);
      let sum = 0;
      for (let i = 0; i < m.data.length; i++) sum += m.data[i];
      const avg = sum / m.data.length / 255;
      const el = document.getElementById('hw-meter-' + cssEsc(deviceId));
      if (el) el.style.width = Math.round(Math.min(1, avg * 2.2) * 100) + '%';
      m.raf = requestAnimationFrame(tick);
    }
    tick();
  } catch (e) {}
}

function stopAudioMeter(deviceId) {
  const m = state.media.audioMeters[deviceId];
  if (!m) return;
  try { if (m.raf) cancelAnimationFrame(m.raf); } catch (e) {}
  try { if (m.ctx && m.ctx.close) m.ctx.close(); } catch (e) {}
  delete state.media.audioMeters[deviceId];
}

// devicechange listener (once)
if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  try {
    navigator.mediaDevices.addEventListener('devicechange', function () {
      refreshMediaDevices();
    });
  } catch (e) {}
}

window.requestMediaPermissions = requestMediaPermissions;
window.refreshMediaDevices = refreshMediaDevices;
window.useHardwareVideoSource = useHardwareVideoSource;
window.useHardwareAudioSource = useHardwareAudioSource;
window.toggleHardwareAudioMute = toggleHardwareAudioMute;
window.setHardwareAudioGain = setHardwareAudioGain;


function renderPublicLinks() {
  const box = document.getElementById('set-public-links');
  if (!box) return;
  const pages = [
    ['Studio', 'index.html'],
    ['Watch', 'watch.html'],
    ['Director', 'director.html'],
    ['Landing', 'landing.html']
  ];
  box.innerHTML = pages.map(function (p) {
    const url = (typeof appPageUrl === 'function') ? appPageUrl(p[1]) : p[1];
    return '<div><span class="text-slate-500">' + p[0] + ':</span> ' + url + '</div>';
  }).join('');
}

function copyPublicLinks() {
  const url = (typeof appPageUrl === 'function') ? appPageUrl('watch.html') : 'watch.html';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      const m = document.getElementById('set-tools-msg');
      if (m) { m.textContent = 'Watch link copied.'; m.className = 'text-[10px] text-green-400 min-h-[16px]'; }
    }).catch(function () {
      prompt('Copy Watch URL:', url);
    });
  } else {
    prompt('Copy Watch URL:', url);
  }
}

function exportAuditLog() {
  const lines = ['Time,Action,Detail,User'];
  (state.auditLog || []).forEach(function (e) {
    lines.push([
      e.time || '',
      e.action || '',
      '"' + String(e.detail || '').replace(/"/g, '') + '"',
      e.user || ''
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bb-audit-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
  a.click();
  if (typeof audit === 'function') audit('AUDIT_EXPORT', 'CSV');
  const m = document.getElementById('set-tools-msg');
  if (m) { m.textContent = 'Audit log exported.'; m.className = 'text-[10px] text-green-400 min-h-[16px]'; }
}

function clearSessionLocalData() {
  if (!confirm('Clear saved settings URLs and local preferences from this browser?')) return;
  try {
    localStorage.removeItem('bb_settings');
    localStorage.removeItem('bb_dest_urls');
    localStorage.removeItem('bb_dest_quality');
  } catch (e) {}
  const m = document.getElementById('set-tools-msg');
  if (m) { m.textContent = 'Local settings cache cleared. Reload to reset defaults.'; m.className = 'text-[10px] text-amber-400 min-h-[16px]'; }
  if (typeof audit === 'function') audit('SETTINGS_CLEAR_CACHE', '');
}

window.renderPublicLinks = renderPublicLinks;
window.copyPublicLinks = copyPublicLinks;
window.exportAuditLog = exportAuditLog;
window.clearSessionLocalData = clearSessionLocalData;


function sourceIdForDevice(deviceId) {
  const src = (state.sources || []).find(function (s) { return s.deviceId === deviceId; });
  if (src) return src.id;
  const cam1 = (state.sources || []).find(function (s) { return s.id === 'cam1' && s.deviceId === deviceId; });
  return cam1 ? 'cam1' : null;
}

async function hwVideoToPreview(deviceId) {
  await useHardwareVideoSource(deviceId);
  const id = sourceIdForDevice(deviceId);
  if (id && typeof selectSource === 'function') selectSource(id);
  if (typeof pushNotification === 'function') pushNotification('Sources', 'Hardware camera on Preview', 'ok');
}

async function hwVideoTake(deviceId) {
  await useHardwareVideoSource(deviceId);
  const id = sourceIdForDevice(deviceId);
  if (id && typeof selectSource === 'function') selectSource(id);
  if (typeof doTake === 'function') doTake();
  else if (typeof completeTake === 'function') completeTake({ type: 'CUT', durationMs: 0 });
  if (typeof pushNotification === 'function') pushNotification('Sources', 'Hardware camera TAKEN to Program', 'ok');
}

async function hwVideoCut(deviceId) {
  await useHardwareVideoSource(deviceId);
  const id = sourceIdForDevice(deviceId);
  if (id && typeof selectSource === 'function') selectSource(id);
  if (typeof doCut === 'function') doCut();
  else if (typeof doTake === 'function') doTake();
  if (typeof pushNotification === 'function') pushNotification('Sources', 'Hardware camera CUT to Program', 'ok');
}

window.hwVideoToPreview = hwVideoToPreview;
window.hwVideoTake = hwVideoTake;
async function hwVideoFade(deviceId) {
  await useHardwareVideoSource(deviceId);
  const id = sourceIdForDevice(deviceId);
  if (id && typeof selectSource === 'function') selectSource(id);
  if (typeof doFade === 'function') doFade();
  else if (typeof completeTake === 'function') completeTake({ type: 'FADE', durationMs: state.fadeDurationMs || 500 });
  if (typeof pushNotification === 'function') pushNotification('Sources', 'Hardware camera FADE to Program', 'ok');
}
window.hwVideoCut = hwVideoCut;
window.hwVideoFade = hwVideoFade;


function setStudioFadeMs(ms) {
  const n = Math.max(100, Math.min(5000, parseInt(ms, 10) || 500));
  state.fadeDurationMs = n;
  if (state.settings) state.settings.fadeDurationMs = n;
  const setEl = document.getElementById('set-fade-ms');
  if (setEl) setEl.value = String(n);
  setSwitcherStatus('FADE ' + (n / 1000) + 's', 'info');
}
function setSwitcherStatus(text, kind) {
  const el = document.getElementById('switcher-status');
  if (!el) return;
  el.textContent = text || 'Ready';
  el.className = 'text-[10px] ml-1 ' + (
    kind === 'ok' ? 'text-green-400' :
    kind === 'warn' ? 'text-amber-400' :
    kind === 'err' ? 'text-red-400' :
    kind === 'busy' ? 'text-cyan-300' :
    'text-slate-500'
  );
}
function syncStudioFadeSelect() {
  const el = document.getElementById('studio-fade-ms');
  if (!el) return;
  const n = state.fadeDurationMs || (state.settings && state.settings.fadeDurationMs) || 500;
  el.value = String(n);
  if (![200, 500, 1000, 1500, 2000].includes(n)) {
    // keep closest
    const opts = [200, 500, 1000, 1500, 2000];
    let best = 500, bd = 1e9;
    opts.forEach(function (o) { const d = Math.abs(o - n); if (d < bd) { bd = d; best = o; } });
    el.value = String(best);
  }
}
window.setStudioFadeMs = setStudioFadeMs;
window.setSwitcherStatus = setSwitcherStatus;


// ========== VIRTUAL STUDIO (upgrades Start Camera → cam1 / Program) ==========
state.vstudio = state.vstudio || {
  open: false,
  chroma: { on: false, key: [0, 255, 0], tol: 0.35, smooth: 0.4, spill: 0.45, edge: 0.3, shadow: 0.25 },
  bgMode: 'none',
  bgColor: '#0a1628',
  bgImage: null,
  bgVideo: null,
  assets: [],
  template: 'modern',
  perf: 'high',
  applied: false,
  raf: null,
  outputStream: null,
  three: null
};

const VSTUDIO_TEMPLATES = {
  modern: { wall: 0x0b1a2e, accent: 0x1d4ed8, desk: 0x1e293b, light: 0xffffff, label: 'Modern News Desk' },
  breaking: { wall: 0x1a0505, accent: 0xdc2626, desk: 0x291010, light: 0xffe4e6, label: 'Breaking News' },
  international: { wall: 0x0c1929, accent: 0x0ea5e9, desk: 0x0f2744, light: 0xe0f2fe, label: 'International' },
  financial: { wall: 0x052e1a, accent: 0x22c55e, desk: 0x0a3d24, light: 0xdcfce7, label: 'Financial' },
  interview: { wall: 0x1c1030, accent: 0xa855f7, desk: 0x2e1065, light: 0xf3e8ff, label: 'Interview' },
  election: { wall: 0x0f172a, accent: 0xf59e0b, desk: 0x1e293b, light: 0xfef3c7, label: 'Election' },
  sports: { wall: 0x052e16, accent: 0x84cc16, desk: 0x14532d, light: 0xecfccb, label: 'Sports' },
  minimal: { wall: 0x111827, accent: 0x94a3b8, desk: 0x1f2937, light: 0xf8fafc, label: 'Minimal' }
};

function openVStudioPanel() {
  const p = document.getElementById('vstudio-panel');
  if (p) p.classList.remove('hidden');
  state.vstudio.open = true;
  if (!state.media.localStream) {
    setVStudioStatus('No camera yet — starting…', 'warn');
    startLocalCamera().then(function () { startVStudioLoop(); }).catch(function () {});
  } else {
    startVStudioLoop();
  }
  renderVStudioAssets();
  setVStudioStatus('Processing local camera into virtual studio preview.', 'ok');
}
function closeVStudioPanel() {
  const p = document.getElementById('vstudio-panel');
  if (p) p.classList.add('hidden');
  state.vstudio.open = false;
  // keep processing if applied
  if (!state.vstudio.applied) stopVStudioLoop(false);
}
function setVStudioStatus(t, kind) {
  const el = document.getElementById('vstudio-status');
  if (!el) return;
  el.textContent = t || '';
  el.className = 'text-[10px] ' + (kind === 'ok' ? 'text-green-400' : kind === 'warn' ? 'text-amber-400' : kind === 'err' ? 'text-red-400' : 'text-slate-500');
}

function vstudioUpdate() {
  const c = state.vstudio.chroma;
  c.on = !!(document.getElementById('vs-chroma-on') && document.getElementById('vs-chroma-on').checked);
  const hex = (document.getElementById('vs-key-color') && document.getElementById('vs-key-color').value) || '#00ff00';
  c.key = hexToRgb(hex);
  c.tol = (parseInt((document.getElementById('vs-tol') || {}).value || 35, 10) / 100);
  c.smooth = (parseInt((document.getElementById('vs-smooth') || {}).value || 40, 10) / 100);
  c.spill = (parseInt((document.getElementById('vs-spill') || {}).value || 45, 10) / 100);
  c.edge = (parseInt((document.getElementById('vs-edge') || {}).value || 30, 10) / 100);
  c.shadow = (parseInt((document.getElementById('vs-shadow') || {}).value || 25, 10) / 100);
  state.vstudio.bgMode = (document.getElementById('vs-bg-mode') && document.getElementById('vs-bg-mode').value) || 'none';
  state.vstudio.bgColor = (document.getElementById('vs-bg-color') && document.getElementById('vs-bg-color').value) || '#0a1628';
  state.vstudio.template = (document.getElementById('vs-template') && document.getElementById('vs-template').value) || 'modern';
  const perfEl = document.getElementById('vs-perf');
  if (perfEl) state.vstudio.perf = perfEl.value || 'high';
  if (state.vstudio.bgMode === 'studio3d') ensureThreeStudio();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function vstudioLoadImage(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = function () {
    state.vstudio.bgImage = img;
    state.vstudio.assets.unshift({ id: 'img_' + Date.now(), type: 'image', name: f.name, url: url, ref: img });
    const mode = document.getElementById('vs-bg-mode');
    if (mode) mode.value = 'image';
    state.vstudio.bgMode = 'image';
    renderVStudioAssets();
    vstudioUpdate();
  };
  img.src = url;
  input.value = '';
}
function vstudioLoadVideo(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  const v = document.createElement('video');
  v.src = url;
  v.loop = true;
  v.muted = true;
  v.playsInline = true;
  v.play().catch(function () {});
  state.vstudio.bgVideo = v;
  state.vstudio.assets.unshift({ id: 'vid_' + Date.now(), type: 'video', name: f.name, url: url, ref: v });
  const mode = document.getElementById('vs-bg-mode');
  if (mode) mode.value = 'video';
  state.vstudio.bgMode = 'video';
  renderVStudioAssets();
  vstudioUpdate();
  input.value = '';
}
function renderVStudioAssets() {
  const box = document.getElementById('vs-bg-assets');
  if (!box) return;
  box.innerHTML = (state.vstudio.assets || []).slice(0, 12).map(function (a) {
    const safe = String(a.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const name = String(a.name || safe).replace(/</g, '');
    return '<button type="button" data-id="' + safe + '" class="vs-asset-btn px-1.5 py-0.5 rounded border border-[#2a3a4f] text-[8px] text-slate-300 truncate max-w-[100px]">' + name + '</button>' +
      '<button type="button" data-del="' + safe + '" class="vs-asset-del text-[8px] text-red-400 px-0.5">×</button>';
  }).join('');
  box.querySelectorAll('.vs-asset-btn').forEach(function (b) {
    b.addEventListener('click', function () { vstudioSelectAsset(b.getAttribute('data-id')); });
  });
  box.querySelectorAll('.vs-asset-del').forEach(function (b) {
    b.addEventListener('click', function () { vstudioDeleteAsset(b.getAttribute('data-del')); });
  });
}
function vstudioSelectAsset(id) {
  const a = (state.vstudio.assets || []).find(function (x) { return x.id === id; });
  if (!a) return;
  if (a.type === 'image') {
    state.vstudio.bgImage = a.ref;
    state.vstudio.bgMode = 'image';
    const mode = document.getElementById('vs-bg-mode');
    if (mode) mode.value = 'image';
  } else {
    state.vstudio.bgVideo = a.ref;
    try { a.ref.play(); } catch (e) {}
    state.vstudio.bgMode = 'video';
    const mode = document.getElementById('vs-bg-mode');
    if (mode) mode.value = 'video';
  }
  vstudioUpdate();
}
function vstudioDeleteAsset(id) {
  state.vstudio.assets = (state.vstudio.assets || []).filter(function (x) { return x.id !== id; });
  renderVStudioAssets();
}

function vstudioSwitchCamera(facing) {
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: true
  }).then(function (stream) {
    if (state.media.localStream) {
      state.media.localStream.getTracks().forEach(function (t) { t.stop(); });
    }
    state.media.localStream = stream;
    const v = document.getElementById('local-cam-video');
    if (v) { v.srcObject = stream; v.play().catch(function () {}); }
    startVStudioLoop();
    setVStudioStatus('Switched to ' + (facing === 'user' ? 'front' : 'back') + ' camera (if device supports it).', 'ok');
  }).catch(function (err) {
    setVStudioStatus('Camera switch failed: ' + (err.message || err) + ' — using available camera.', 'warn');
  });
}


// --- WebGL chroma key (GPU); falls back to CPU chromaKeyFrame ---
function ensureWebGLChroma(w, h) {
  if (state.vstudio.glChroma && state.vstudio.glChroma.w === w && state.vstudio.glChroma.h === h) {
    return state.vstudio.glChroma;
  }
  const canvas = document.getElementById('vstudio-gl') || document.createElement('canvas');
  canvas.id = 'vstudio-gl';
  canvas.width = w;
  canvas.height = h;
  canvas.className = 'hidden';
  if (!canvas.parentNode) document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true }) ||
    canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: true });
  if (!gl) {
    state.vstudio.glChroma = null;
    return null;
  }
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('VS shader', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, 'attribute vec2 a;varying vec2 v;void main(){v=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}');
  const fs = compile(gl.FRAGMENT_SHADER, [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D uTex;',
    'uniform vec3 uKey;',
    'uniform float uTol,uSmooth,uSpill,uShadow;',
    'void main(){',
    ' vec4 c=texture2D(uTex,vec2(v.x,1.0-v.y));',
    ' vec3 rgb=c.rgb;',
    ' float dist=distance(rgb,uKey);',
    ' float greenness=rgb.g-max(rgb.r,rgb.b);',
    ' float blueness=rgb.b-max(rgb.r,rgb.g);',
    ' if(uKey.g>=uKey.r&&uKey.g>=uKey.b) dist-=max(0.,greenness)*0.35;',
    ' else if(uKey.b>=uKey.r&&uKey.b>=uKey.g) dist-=max(0.,blueness)*0.35;',
    ' float lum=dot(rgb,vec3(0.2126,0.7152,0.0722));',
    ' if(lum<0.15) dist+=uShadow*0.5;',
    ' float a=smoothstep(uTol,uTol+max(0.001,uSmooth),dist);',
    ' if(a>0.1&&a<0.95){',
    '  float t=(1.0-a)*uSpill;',
    '  if(uKey.g>=uKey.r&&uKey.g>=uKey.b) rgb.g=mix(rgb.g,(rgb.r+rgb.b)*0.5,t);',
    '  else if(uKey.b>=uKey.r&&uKey.b>=uKey.g) rgb.b=mix(rgb.b,(rgb.r+rgb.g)*0.5,t);',
    ' }',
    ' gl_FragColor=vec4(rgb,a);',
    '}'
  ].join('\n'));
  if (!vs || !fs) { state.vstudio.glChroma = null; return null; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    state.vstudio.glChroma = null;
    return null;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  state.vstudio.glChroma = {
    canvas: canvas, gl: gl, prog: prog, buf: buf, tex: tex, w: w, h: h,
    loc: {
      a: gl.getAttribLocation(prog, 'a'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uKey: gl.getUniformLocation(prog, 'uKey'),
      uTol: gl.getUniformLocation(prog, 'uTol'),
      uSmooth: gl.getUniformLocation(prog, 'uSmooth'),
      uSpill: gl.getUniformLocation(prog, 'uSpill'),
      uShadow: gl.getUniformLocation(prog, 'uShadow')
    }
  };
  return state.vstudio.glChroma;
}

function chromaKeyWebGL(srcVideo, w, h) {
  const g = ensureWebGLChroma(w, h);
  if (!g || !srcVideo || srcVideo.readyState < 2) return null;
  const gl = g.gl;
  gl.viewport(0, 0, w, h);
  gl.useProgram(g.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
  gl.enableVertexAttribArray(g.loc.a);
  gl.vertexAttribPointer(g.loc.a, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, g.tex);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcVideo);
  } catch (e) { return null; }
  const key = state.vstudio.chroma.key;
  gl.uniform1i(g.loc.uTex, 0);
  gl.uniform3f(g.loc.uKey, key[0] / 255, key[1] / 255, key[2] / 255);
  gl.uniform1f(g.loc.uTol, state.vstudio.chroma.tol);
  gl.uniform1f(g.loc.uSmooth, Math.max(0.001, state.vstudio.chroma.smooth));
  gl.uniform1f(g.loc.uSpill, state.vstudio.chroma.spill);
  gl.uniform1f(g.loc.uShadow, state.vstudio.chroma.shadow);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return g.canvas;
}

function vsProcessSize() {
  const mode = state.vstudio.perf || 'high';
  if (mode === 'low') return { w: 640, h: 360 };
  if (mode === 'medium') return { w: 854, h: 480 };
  return { w: 960, h: 540 };
}

// --- Chroma key via 2D canvas (fallback) ---
function getRawCameraVideoEl() {
  let rv = document.getElementById('local-cam-raw-video');
  if (!rv) {
    rv = document.createElement('video');
    rv.id = 'local-cam-raw-video';
    rv.autoplay = true;
    rv.playsInline = true;
    rv.muted = true;
    rv.style.display = 'none';
    document.body.appendChild(rv);
  }
  if (state.media.rawCameraStream && rv.srcObject !== state.media.rawCameraStream) {
    rv.srcObject = state.media.rawCameraStream;
    rv.play().catch(function () {});
  }
  return rv;
}

function chromaKeyFrame(ctx, w, h, srcVideo) {
  if (!srcVideo || srcVideo.readyState < 2) return;
  ctx.drawImage(srcVideo, 0, 0, w, h);
  if (!state.vstudio.chroma.on) return;
  const frame = ctx.getImageData(0, 0, w, h);
  const d = frame.data;
  const key = state.vstudio.chroma.key;
  const tol = state.vstudio.chroma.tol;
  const smooth = Math.max(0.001, state.vstudio.chroma.smooth);
  const spill = state.vstudio.chroma.spill;
  const shadow = state.vstudio.chroma.shadow;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // distance in RGB + chroma bias toward green/blue dominance
    const dr = (r - key[0]) / 255, dg = (g - key[1]) / 255, db = (b - key[2]) / 255;
    let dist = Math.sqrt(dr * dr + dg * dg + db * db);
    // boost key when channel matches green/blue screen dominance
    if (key[1] > key[0] && key[1] > key[2]) {
      const greenness = (g - Math.max(r, b)) / 255;
      if (greenness > 0) dist -= greenness * 0.35;
    } else if (key[2] > key[0] && key[2] > key[1]) {
      const blueness = (b - Math.max(r, g)) / 255;
      if (blueness > 0) dist -= blueness * 0.35;
    }
    // shadow protection: dark pixels less likely keyed
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.15) dist += shadow * 0.5;
    let alpha = (dist - tol) / smooth;
    alpha = Math.max(0, Math.min(1, alpha));
    d[i + 3] = Math.round(alpha * 255);
    // spill reduction: pull key channel toward neutral on edge
    if (alpha > 0.1 && alpha < 0.95) {
      const t = (1 - alpha) * spill;
      if (key[1] >= key[0] && key[1] >= key[2]) {
        d[i + 1] = Math.round(g * (1 - t) + ((r + b) / 2) * t);
      } else if (key[2] >= key[0] && key[2] >= key[1]) {
        d[i + 2] = Math.round(b * (1 - t) + ((r + g) / 2) * t);
      }
    }
  }
  // light edge soften: simple box on alpha (cheap)
  if (state.vstudio.chroma.edge > 0.05) {
    // skip full blur for perf — alpha already soft via smooth
  }
  ctx.putImageData(frame, 0, 0);
}

function ensureThreeStudio() {
  if (state.vstudio.three) return;
  if (typeof THREE === 'undefined') {
    setVStudioStatus('Three.js not loaded — using flat background. Check network/CDN.', 'warn');
    return;
  }
  const host = document.getElementById('vstudio-three-host');
  if (!host) return;
  host.innerHTML = '';
  const w = host.clientWidth || 640;
  const h = host.clientHeight || 360;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  camera.position.set(0, 1.4, 4.2);
  camera.lookAt(0, 1.1, 0);
  const tpl = VSTUDIO_TEMPLATES[state.vstudio.template] || VSTUDIO_TEMPLATES.modern;
  scene.add(new THREE.AmbientLight(0x6688aa, 0.55));
  const key = new THREE.DirectionalLight(tpl.light, 0.9);
  key.position.set(2, 5, 3);
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ color: tpl.wall }));
  back.position.set(0, 2.2, -2.5);
  scene.add(back);
  // LED wall
  const led = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.2), new THREE.MeshStandardMaterial({ color: tpl.accent, emissive: tpl.accent, emissiveIntensity: 0.35 }));
  led.position.set(0, 2.0, -2.45);
  scene.add(led);
  // desk
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: tpl.desk, metalness: 0.3, roughness: 0.35 }));
  desk.position.set(0, 0.85, 0.6);
  scene.add(desk);
  const deskFront = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: tpl.accent, emissive: tpl.accent, emissiveIntensity: 0.15 }));
  deskFront.position.set(0, 0.5, 1.0);
  scene.add(deskFront);
  // presenter plane (video texture updated each frame)
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas);
  const presenter = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  presenter.position.set(0, 1.35, 0.85);
  scene.add(presenter);
  state.vstudio.three = { renderer: renderer, scene: scene, camera: camera, tex: tex, pcanvas: canvas, presenter: presenter, led: led, back: back, desk: desk, deskFront: deskFront };
}

function vstudioChangeTemplate() {
  if (!state.vstudio.three) return;
  const tpl = VSTUDIO_TEMPLATES[state.vstudio.template] || VSTUDIO_TEMPLATES.modern;
  const t = state.vstudio.three;
  if (t.back) t.back.material.color.setHex(tpl.wall);
  if (t.led) { t.led.material.color.setHex(tpl.accent); t.led.material.emissive.setHex(tpl.accent); }
  if (t.deskFront) { t.deskFront.material.color.setHex(tpl.accent); t.deskFront.material.emissive.setHex(tpl.accent); }
  if (t.desk) t.desk.material.color.setHex(tpl.desk);
}

function startVStudioLoop() {
  if (state.vstudio.raf) cancelAnimationFrame(state.vstudio.raf);
  const canvas = document.getElementById('vstudio-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  function frame() {
    state.vstudio.raf = requestAnimationFrame(frame);
    let video = (typeof getRawCameraVideoEl === 'function') ? getRawCameraVideoEl() : document.getElementById('local-cam-video');
    if (!video || !video.srcObject) video = document.getElementById('local-cam-video');
    if (!video || video.readyState < 2) return;
    const dim = (typeof vsProcessSize === 'function') ? vsProcessSize() : { w: 960, h: 540 };
    const w = dim.w, h = dim.h;
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    // background layer
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    const mode = state.vstudio.bgMode;
    if (mode === 'color') {
      ctx.fillStyle = state.vstudio.bgColor || '#0a1628';
      ctx.fillRect(0, 0, w, h);
    } else if (mode === 'image' && state.vstudio.bgImage) {
      drawCover(ctx, state.vstudio.bgImage, w, h);
    } else if (mode === 'video' && state.vstudio.bgVideo) {
      drawCover(ctx, state.vstudio.bgVideo, w, h);
    } else if (mode === 'studio3d' && state.vstudio.three) {
      // update presenter texture with keyed subject on transparent
      const pc = state.vstudio.three.pcanvas;
      const pctx = pc.getContext('2d', { willReadFrequently: true });
      pctx.clearRect(0, 0, pc.width, pc.height);
      // draw keyed person centered
      const tmp = document.createElement('canvas');
      tmp.width = pc.width; tmp.height = pc.height;
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      chromaKeyFrame(tctx, tmp.width, tmp.height, video);
      pctx.drawImage(tmp, 0, 0);
      state.vstudio.three.tex.needsUpdate = true;
      state.vstudio.three.renderer.render(state.vstudio.three.scene, state.vstudio.three.camera);
      ctx.drawImage(state.vstudio.three.renderer.domElement, 0, 0, w, h);
      return;
    } else {
      // passthrough — still allow chroma over black
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
    // foreground keyed (prefer WebGL GPU path)
    if (state.vstudio.chroma.on) {
      const glCanvas = (typeof chromaKeyWebGL === 'function') ? chromaKeyWebGL(video, w, h) : null;
      if (glCanvas) {
        if (mode === 'none') {
          ctx.clearRect(0, 0, w, h);
        }
        ctx.drawImage(glCanvas, 0, 0, w, h);
      } else if (mode !== 'none') {
        if (!state.vstudio._cpuTmp) state.vstudio._cpuTmp = document.createElement('canvas');
        const tmp = state.vstudio._cpuTmp;
        tmp.width = w; tmp.height = h;
        const tctx = tmp.getContext('2d', { willReadFrequently: true });
        chromaKeyFrame(tctx, w, h, video);
        ctx.drawImage(tmp, 0, 0);
      } else {
        chromaKeyFrame(ctx, w, h, video);
      }
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }
  }
  frame();
}

function drawCover(ctx, src, w, h) {
  try {
    const sw = src.videoWidth || src.naturalWidth || src.width || w;
    const sh = src.videoHeight || src.naturalHeight || src.height || h;
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } catch (e) {}
}

function stopVStudioLoop(resetApplied) {
  if (state.vstudio.raf) cancelAnimationFrame(state.vstudio.raf);
  state.vstudio.raf = null;
  if (resetApplied) state.vstudio.applied = false;
}

function applyVStudioToProgram() {
  vstudioUpdate();
  const canvas = document.getElementById('vstudio-canvas');
  if (!canvas) return;
  // Capture processed canvas into a stream and replace cam1 video track
  let out;
  try {
    out = canvas.captureStream(30);
  } catch (e) {
    setVStudioStatus('captureStream not supported — cannot apply processed video.', 'err');
    return;
  }
  state.vstudio.outputStream = out;
  state.vstudio.applied = true;
  if (!state.vstudio.raf) startVStudioLoop();
  // Preserve raw camera for ongoing chroma; Program uses processed stream
  if (!state.media.rawCameraStream) {
    const lv = document.getElementById('local-cam-video');
    if (lv && lv.srcObject) state.media.rawCameraStream = lv.srcObject;
  }
  if (typeof getRawCameraVideoEl === 'function') getRawCameraVideoEl();
  const audioTracks = (state.media.rawCameraStream && state.media.rawCameraStream.getAudioTracks()) ||
    (state.media.localStream && state.media.localStream.getAudioTracks()) || [];
  const merged = new MediaStream([].concat(out.getVideoTracks(), audioTracks));
  state.media.localStream = merged;
  state.media.vstudioProcessed = true;
  ensureRawCameraVideo();
  if (!state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
  const cam = state.sources.find(function (s) { return s.id === 'cam1'; });
  if (cam) {
    cam.name = 'Camera 1 (Virtual Studio)';
    cam.status = 'live';
    cam.hasStream = true;
  }
  state.previewSlots[0] = 'cam1';
  if (typeof renderPreview === 'function') renderPreview();
  if (typeof renderSources === 'function') renderSources();
  setVStudioStatus('Applied to Studio — TAKE to put Virtual Studio on Program.', 'ok');
  if (typeof pushNotification === 'function') pushNotification('Virtual Studio', 'Processed camera on Preview (cam1)', 'ok');
  if (typeof audit === 'function') audit('VSTUDIO_APPLY', state.vstudio.bgMode + (state.vstudio.chroma.on ? '+chroma' : ''));
}

function ensureRawCameraVideo() {
  // When applied, compositor reads local-cam-video — we need processed frames.
  // Point a dedicated processed video at output stream for compositor via deviceStreams path:
  let pv = document.getElementById('vstudio-processed-video');
  if (!pv) {
    pv = document.createElement('video');
    pv.id = 'vstudio-processed-video';
    pv.autoplay = true;
    pv.playsInline = true;
    pv.muted = true;
    pv.style.display = 'none';
    document.body.appendChild(pv);
  }
  if (state.vstudio.outputStream) {
    pv.srcObject = state.vstudio.outputStream;
    pv.play().catch(function () {});
  }
  // Hook compositor: treat cam1 as this processed video when applied
  state.media.vstudioVideo = pv;
}

// Patch note: compositeLoop uses local-cam-video for cam1 — also allow vstudioVideo
// (handled via drawSlot override below if needed)

function createRemoteCameraSession() {
  const token = 'rcam_' + Math.random().toString(36).slice(2, 10);
  const facing = (document.getElementById('vs-remote-facing') && document.getElementById('vs-remote-facing').value) || 'user';
  const mic = (document.getElementById('vs-remote-mic') && document.getElementById('vs-remote-mic').value) || 'default';
  const exp = Date.now() + 24 * 3600 * 1000;
  const session = { token: token, facing: facing, mic: mic, expires: exp, revoked: false, created: Date.now() };
  state.remoteCameraSessions = state.remoteCameraSessions || [];
  session.shareUrl = (typeof appPageUrl === 'function') ? appPageUrl('remote.html', 'token=' + encodeURIComponent(token) + '&cam=' + encodeURIComponent(facing) + '&mic=' + encodeURIComponent(mic) + '&vstudio=1') : ('remote.html?token=' + token);
  state.remoteCameraSessions.unshift(session);
  try {
    localStorage.setItem('bb_remote_cam_sessions', JSON.stringify(state.remoteCameraSessions.slice(0, 20)));
  } catch (e) {}
  const url = (typeof appPageUrl === 'function')
    ? appPageUrl('remote.html', 'token=' + encodeURIComponent(token) + '&cam=' + encodeURIComponent(facing) + '&mic=' + encodeURIComponent(mic) + '&vstudio=1')
    : ('remote.html?token=' + token);
  const box = document.getElementById('vstudio-remote-link');
  if (box) box.innerHTML = '<span class="text-slate-500">Remote link:</span> ' + url +
    ' <button type="button" class="text-cyan-300 underline ml-1" data-url="' + url.replace(/"/g, '&quot;') + '" onclick="navigator.clipboard.writeText(this.getAttribute(\'data-url\'))">Copy</button>';
  // Register as remote source in roster
  let src = state.sources.find(function (s) { return s.shareToken === token; });
  if (!src) {
    src = {
      id: 'remote_' + token.slice(-6),
      name: 'Remote Camera Session',
      type: 'remote',
      status: 'waiting',
      res: '—',
      role: 'Remote VS',
      color: '#6d28d9',
      icon: '📡',
      hasStream: false,
      shareToken: token,
      shareUrl: url
    };
    state.sources.push(src);
  }
  if (typeof renderSourcesPage === 'function') renderSourcesPage();
  if (typeof renderRemoteCameraSessions === 'function') renderRemoteCameraSessions();
  if (typeof pushNotification === 'function') pushNotification('Remote Camera', 'Session link created', 'ok');
  if (typeof audit === 'function') audit('RCAM_SESSION', token);
  return url;
}

window.openVStudioPanel = openVStudioPanel;
window.closeVStudioPanel = closeVStudioPanel;
window.vstudioUpdate = vstudioUpdate;
window.vstudioLoadImage = vstudioLoadImage;
window.vstudioLoadVideo = vstudioLoadVideo;
window.vstudioSelectAsset = vstudioSelectAsset;
window.vstudioDeleteAsset = vstudioDeleteAsset;
window.vstudioSwitchCamera = vstudioSwitchCamera;
window.vstudioChangeTemplate = vstudioChangeTemplate;
window.applyVStudioToProgram = applyVStudioToProgram;
window.createRemoteCameraSession = createRemoteCameraSession;


function renderRemoteCameraSessions() {
  const box = document.getElementById('rcam-sessions');
  if (!box) return;
  const list = state.remoteCameraSessions || [];
  if (!list.length) {
    box.innerHTML = '<div class="text-slate-500 text-[10px] py-1">No remote camera sessions yet. Create one from Virtual Studio.</div>';
    return;
  }
  box.innerHTML = list.slice(0, 8).map(function (s) {
    const expired = s.expires && Date.now() > s.expires;
    const st = s.revoked ? 'Revoked' : (expired ? 'Expired' : 'Active');
    const cls = s.revoked || expired ? 'text-slate-500' : 'text-green-400';
    const url = s.shareUrl || ((typeof appPageUrl === 'function') ? appPageUrl('remote.html', 'token=' + encodeURIComponent(s.token)) : s.token);
    return '<div class="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a] text-[10px]">' +
      '<div class="min-w-0"><div class="text-slate-200 font-mono truncate">' + s.token + '</div>' +
      '<div class="' + cls + '">' + st + ' · cam ' + (s.facing || 'user') + '</div></div>' +
      '<div class="flex gap-1 shrink-0">' +
      '<button type="button" data-url="' + String(url).replace(/"/g, '&quot;') + '" class="rcam-copy px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-100">Copy</button>' +
      '<button type="button" data-tok="' + s.token + '" class="rcam-rev px-1.5 py-0.5 rounded bg-red-950 text-red-300">Revoke</button>' +
      '</div></div>';
  }).join('');
  box.querySelectorAll('.rcam-copy').forEach(function (b) {
    b.addEventListener('click', function () {
      const u = b.getAttribute('data-url');
      if (navigator.clipboard) navigator.clipboard.writeText(u).catch(function () { prompt('Copy', u); });
      else prompt('Copy', u);
    });
  });
  box.querySelectorAll('.rcam-rev').forEach(function (b) {
    b.addEventListener('click', function () { revokeRemoteCameraSession(b.getAttribute('data-tok')); });
  });
}
function revokeRemoteCameraSession(token) {
  (state.remoteCameraSessions || []).forEach(function (s) {
    if (s.token === token) s.revoked = true;
  });
  try { localStorage.setItem('bb_remote_cam_sessions', JSON.stringify(state.remoteCameraSessions || [])); } catch (e) {}
  const src = (state.sources || []).find(function (s) { return s.shareToken === token; });
  if (src) src.status = 'revoked';
  renderRemoteCameraSessions();
  if (typeof audit === 'function') audit('RCAM_REVOKE', token);
}
window.renderRemoteCameraSessions = renderRemoteCameraSessions;
window.revokeRemoteCameraSession = revokeRemoteCameraSession;

try {
  const _rcs = JSON.parse(localStorage.getItem('bb_remote_cam_sessions') || '[]');
  if (Array.isArray(_rcs)) state.remoteCameraSessions = _rcs;
} catch (e) {}


function applyVideoFilterPreset(name) {
  const presets = {
    neutral: { brightness: 100, contrast: 100, hue: 0, smooth: 0 },
    bright: { brightness: 118, contrast: 105, hue: 0, smooth: 0 },
    cinema: { brightness: 95, contrast: 115, hue: 350, smooth: 1 },
    soft: { brightness: 105, contrast: 95, hue: 0, smooth: 3 },
    cool: { brightness: 100, contrast: 108, hue: 200, smooth: 0 },
    warm: { brightness: 105, contrast: 105, hue: 25, smooth: 0 }
  };
  const p = presets[name] || presets.neutral;
  Object.keys(p).forEach(function (k) {
    const id = k === 'smooth' ? 'vf-smooth' : ('vf-' + k);
    const input = document.getElementById(id);
    if (input) input.value = p[k];
    setVideoFilter(k, p[k]);
  });
  if (typeof audit === 'function') audit('VIDEO_FILTER_PRESET', name);
  if (typeof pushNotification === 'function') pushNotification('Filters', 'Preset: ' + name, 'ok');
}
window.applyVideoFilterPreset = applyVideoFilterPreset;


function snapshotProgramFrame(addAsSource) {
  if (!state.media.compositorActive && typeof startCompositor === 'function') startCompositor();
  const canvas = document.getElementById('program-canvas');
  if (!canvas || canvas.width < 16) {
    if (typeof pushNotification === 'function') pushNotification('Snapshot', 'Program canvas not ready', 'warn');
    return;
  }
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (e) {
    if (typeof pushNotification === 'function') pushNotification('Snapshot', 'Could not capture frame (tainted canvas?)', 'error');
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = 'Program-' + stamp + '.png';

  // Download PNG
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    a.click();
  } catch (e) {}

  if (addAsSource) {
    const id = 'snap_' + Date.now().toString(36);
    state.sources.push({
      id: id,
      name: 'Snapshot ' + stamp.slice(11),
      type: 'image',
      status: 'ready',
      res: canvas.width + '×' + canvas.height,
      role: 'Still',
      color: '#b45309',
      icon: '🖼',
      hasStream: true,
      imageUrl: dataUrl
    });
    if (typeof selectSource === 'function') selectSource(id);
    if (typeof renderSources === 'function') renderSources();
    if (typeof renderSourcesPage === 'function') renderSourcesPage();
    if (typeof pushNotification === 'function') pushNotification('Snapshot', 'PNG saved and added as image source (Preview)', 'ok');
    if (typeof audit === 'function') audit('SNAPSHOT_SOURCE', id);
  } else {
    if (typeof pushNotification === 'function') pushNotification('Snapshot', 'PNG downloaded: ' + name, 'ok');
    if (typeof audit === 'function') audit('SNAPSHOT', name);
  }
}
window.snapshotProgramFrame = snapshotProgramFrame;

window.addRecordingMarker = addRecordingMarker;
function markRecordingNow() {
  addRecordingMarker('MARK', 'manual');
  if (typeof pushNotification === 'function') {
    pushNotification('REC', state.media.recording ? 'Marker added' : 'Start recording first', state.media.recording ? 'ok' : 'warn');
  }
}
window.markRecordingNow = markRecordingNow;


function toggleRecordingMarkers(id) {
  const box = document.getElementById('rec-marks-' + id);
  if (!box) return;
  if (!box.classList.contains('hidden') && box.innerHTML) {
    box.classList.add('hidden');
    return;
  }
  const r = (state.recordings || []).find(function (x) { return x.id === id; });
  if (!r || !r.markers || !r.markers.length) {
    box.innerHTML = '<div>No markers</div>';
  } else {
    box.innerHTML = r.markers.map(function (m) {
      const sec = (typeof m.t === 'number') ? m.t : 0;
      const mm = Math.floor(sec / 60);
      const ss = Math.floor(sec % 60);
      const ts = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
      return '<div>' + ts + ' · ' + (m.label || 'MARK') + (m.detail ? (' · ' + m.detail) : '') + '</div>';
    }).join('');
  }
  box.classList.remove('hidden');
}

function exportRecordingMarkers(id) {
  const r = (state.recordings || []).find(function (x) { return x.id === id; });
  if (!r || !r.markers || !r.markers.length) {
    if (typeof pushNotification === 'function') pushNotification('Markers', 'No markers on this recording', 'warn');
    return;
  }
  const lines = ['timecode_sec,label,detail,wall_clock'];
  r.markers.forEach(function (m) {
    lines.push([
      m.t != null ? m.t : '',
      '"' + String(m.label || '').replace(/"/g, '') + '"',
      '"' + String(m.detail || '').replace(/"/g, '') + '"',
      m.at ? new Date(m.at).toISOString() : ''
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (r.name || 'recording').replace(/\\.webm$/i, '') + '-markers.csv';
  a.click();
  if (typeof audit === 'function') audit('REC_MARKERS_EXPORT', r.id);
  if (typeof pushNotification === 'function') pushNotification('Markers', 'CSV exported', 'ok');
}
window.toggleRecordingMarkers = toggleRecordingMarkers;
window.exportRecordingMarkers = exportRecordingMarkers;


// ===== Program media volume (YouTube + uploaded video) =====
state.media.programMuted = state.media.programMuted != null ? state.media.programMuted : true;
state.media.programVolume = state.media.programVolume != null ? state.media.programVolume : 80;

function applyProgramMediaVolume() {
  const muted = !!state.media.programMuted;
  const vol = Math.max(0, Math.min(100, Number(state.media.programVolume) || 0));
  // YouTube iframe API
  const iframe = document.getElementById('program-yt-iframe');
  if (iframe && iframe.contentWindow) {
    try {
      const payload = function (func, args) {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*');
      };
      if (muted) payload('mute');
      else {
        payload('unMute');
        payload('setVolume', [vol]);
      }
      payload('playVideo');
    } catch (e) {}
  }
  // Uploaded / media elements used in preview/program
  document.querySelectorAll('video[id^="comp-media-"], video[id^="src-media-"], #program-content video, #program-media-video').forEach(function (v) {
    try {
      v.muted = muted;
      v.volume = muted ? 0 : (vol / 100);
      if (!muted && v.paused) v.play().catch(function () {});
    } catch (e) {}
  });
  const muteBtn = document.getElementById('pgm-media-mute');
  if (muteBtn) muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  const volEl = document.getElementById('pgm-media-vol');
  if (volEl) volEl.value = vol;
  const volLab = document.getElementById('pgm-media-vol-lab');
  if (volLab) volLab.textContent = muted ? 'Muted' : (vol + '%');
}

function toggleProgramMediaMute() {
  state.media.programMuted = !state.media.programMuted;
  // Rebuild YT iframe if mute param must change for autoplay edge cases
  const el = document.getElementById('program-content');
  if (el && el.dataset.bbLayer && el.dataset.bbLayer.indexOf('yt:') === 0) {
    el.dataset.bbLayer = '';
    if (typeof syncProgramMediaLayer === 'function') syncProgramMediaLayer();
  }
  applyProgramMediaVolume();
  if (typeof audit === 'function') audit('MEDIA_MUTE', state.media.programMuted ? 'muted' : 'unmuted');
}

function setProgramMediaVolume(v) {
  state.media.programVolume = Number(v) || 0;
  if (state.media.programVolume > 0) state.media.programMuted = false;
  applyProgramMediaVolume();
}

window.applyProgramMediaVolume = applyProgramMediaVolume;
window.toggleProgramMediaMute = toggleProgramMediaMute;
window.setProgramMediaVolume = setProgramMediaVolume;

// ===== Control-room keyboard shortcuts (desktop) =====
function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

function handleControlRoomKeys(e) {
  if (isTypingTarget(e.target)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = (e.key || '').toLowerCase();
  // Space / T — TAKE
  if (k === ' ' || k === 't') {
    e.preventDefault();
    if (typeof doTake === 'function') doTake();
    return;
  }
  if (k === 'c') {
    e.preventDefault();
    if (typeof doCut === 'function') doCut();
    else if (typeof completeTake === 'function') completeTake({ type: 'CUT', durationMs: 0 });
    return;
  }
  if (k === 'f') {
    e.preventDefault();
    if (typeof doFade === 'function') doFade();
    return;
  }
  if (k === 'h') {
    e.preventDefault();
    if (typeof toggleHold === 'function') toggleHold();
    return;
  }
  if (k === 'b') {
    e.preventDefault();
    if (typeof doBlack === 'function') doBlack();
    return;
  }
  if (k === 'e') {
    e.preventDefault();
    if (typeof toggleEmergency === 'function') toggleEmergency();
    return;
  }
  // 1–6 — select preview source by roster index
  if (k >= '1' && k <= '6') {
    e.preventDefault();
    const idx = parseInt(k, 10) - 1;
    const list = (state.sources || []).filter(function (s) { return s && s.id; });
    if (list[idx] && typeof selectSource === 'function') {
      selectSource(list[idx].id);
      if (typeof pushNotification === 'function') {
        pushNotification('PVW', list[idx].name || list[idx].id, 'info');
      }
    }
    return;
  }
  // M — drop recording marker while recording
  if (k === 'm') {
    e.preventDefault();
    if (state.media && state.media.recording && typeof addRecordingMarker === 'function') {
      addRecordingMarker('MARK', 'keyboard');
      if (typeof pushNotification === 'function') pushNotification('REC', 'Marker added', 'ok');
    } else if (typeof pushNotification === 'function') {
      pushNotification('REC', 'Not recording', 'warn');
    }
    return;
  }
  // R — toggle local Program recording
  if (k === 'r') {
    e.preventDefault();
    if (state.media && state.media.recording) {
      if (typeof stopLocalRecord === 'function') stopLocalRecord();
    } else if (typeof startLocalRecord === 'function') {
      startLocalRecord();
    }
    return;
  }
  // G — toggle lower-third on Program
  if (k === 'g') {
    e.preventDefault();
    if (typeof toggleGraphic === 'function') {
      toggleGraphic('lt');
    } else if (state.graphics && state.graphics.lt) {
      state.graphics.lt.enabled = !state.graphics.lt.enabled;
      state.graphics.lt.on = state.graphics.lt.enabled;
      if (typeof applyGraphicsToProgram === 'function') applyGraphicsToProgram();
      if (typeof pushNotification === 'function') {
        pushNotification('GFX', state.graphics.lt.enabled ? 'Lower third ON' : 'Lower third OFF', 'info');
      }
    }
    return;
  }
  // N — next rundown item (News Director)
  if (k === 'n') {
    e.preventDefault();
    if (typeof rundownNext === 'function') rundownNext();
    return;
  }
  // P — previous rundown item
  if (k === 'p') {
    e.preventDefault();
    if (typeof rundownPrev === 'function') rundownPrev();
    return;
  }
  // A — toggle Auto Director
  if (k === 'a') {
    e.preventDefault();
    const on = !state.autoDirector;
    if (typeof toggleAutoDirector === 'function') toggleAutoDirector(on);
    const a1 = document.getElementById('auto-director');
    const a2 = document.getElementById('nd-auto');
    if (a1) a1.checked = on;
    if (a2) a2.checked = on;
    if (typeof pushNotification === 'function') {
      pushNotification('AUTO', on ? 'Auto Director armed' : 'Auto Director off', on ? 'warn' : 'info');
    }
    return;
  }
  if (k === 'escape') {
    if (state.emergency && typeof clearEmergency === 'function') {
      e.preventDefault();
      clearEmergency();
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleControlRoomKeys);
  window.handleControlRoomKeys = handleControlRoomKeys;
}



// ===== Studio layout helpers (Preview | Program) =====
function setMobileMonitorFocus(which) {
  which = which === 'program' ? 'program' : 'preview';
  document.body.classList.remove('mob-mon-preview', 'mob-mon-program');
  document.body.classList.add(which === 'program' ? 'mob-mon-program' : 'mob-mon-preview');
  const pvw = document.getElementById('mob-mon-pvw');
  const pgm = document.getElementById('mob-mon-pgm');
  if (pvw) {
    pvw.className = 'flex-1 py-1 rounded text-[10px] font-bold border ' +
      (which === 'preview' ? 'border-green-500 bg-green-900 text-green-200' : 'border-green-900 bg-green-950/40 text-green-600');
  }
  if (pgm) {
    pgm.className = 'flex-1 py-1 rounded text-[10px] font-bold border ' +
      (which === 'program' ? 'border-red-500 bg-red-950 text-red-200' : 'border-red-900 bg-red-950/30 text-red-700');
  }
  try { if (typeof sizeMonitorFrames === 'function') sizeMonitorFrames(); } catch (e) {}
}
window.setMobileMonitorFocus = setMobileMonitorFocus;

function toggleMonitorFullscreen(which) {
  const id = which === 'program' ? 'program-monitor' : 'preview-monitor';
  const el = document.getElementById(id);
  if (!el) return;
  try {
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || function(){}).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen || function(){}).call(document);
    }
  } catch (e) {
    if (typeof pushNotification === 'function') pushNotification('UI', 'Fullscreen not available', 'warn');
  }
}
window.toggleMonitorFullscreen = toggleMonitorFullscreen;

// Default mobile focus
try {
  if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
    setMobileMonitorFocus('program');
  }
} catch (e) {}
