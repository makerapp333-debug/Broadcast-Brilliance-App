
// BROADCAST BRILLIANCE — Finance client (calls server; never trusts local balances as source of truth)
(function () {
  'use strict';

  function financeBase() {
    const s = (state.settings && (state.settings.financeApiUrl || state.settings.bridgeUrl)) || '';
    if (s) {
      try {
        const u = new URL(s.replace(/^ws/, 'http'));
        return u.origin;
      } catch (e) {}
    }
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
    return 'http://localhost:8787';
  }

  async function clientHasFeature(featureKey) {
    try {
      const r = await financeFetch('/api/v1/finance/features/' + encodeURIComponent(featureKey));
      return !!(r && r.allowed);
    } catch (e) {
      return true; // offline: do not block studio
    }
  }
  async function requireFeature(featureKey, label) {
    const ok = await clientHasFeature(featureKey);
    if (ok) return true;
    const msg = (label || featureKey) + ' is available on a higher plan. Upgrade under Plans.';
    if (typeof pushNotification === 'function') pushNotification('Subscription', msg, 'warn');
    else alert(msg);
    if (typeof navigateTo === 'function') navigateTo('subscriptions');
    return false;
  }
  function currentFinanceUserId() {
    return (state.currentUserId || 'u1');
  }

  async function financeFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({
      'Content-Type': 'application/json',
      'X-User-Id': currentFinanceUserId()
    }, opts.headers || {});
    let res;
    try {
      res = await fetch(financeBase() + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (netErr) {
      throw new Error('Finance API unreachable (' + financeBase() + '). Start the server or set Settings → Finance API URL.');
    }
    const data = await res.json().catch(function () { return { ok: false, message: res.statusText || 'Invalid JSON' }; });
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error(data.message || 'Too many requests — wait a moment and try again.');
      }
      if (res.status === 403) {
        throw new Error(data.message || 'Forbidden — check plan features or admin role.');
      }
      throw new Error(data.message || res.statusText || ('HTTP ' + res.status));
    }
    return data;
  }

  async function loadWalletDashboard() {
    const box = document.getElementById('wallet-dashboard');
    if (!box) return;
    if (typeof updateFinanceNavBadge === 'function') updateFinanceNavBadge();
    box.innerHTML = '<div class="text-slate-500 text-[11px] p-3">Loading wallet from server…</div>';
    try {
      const w = await financeFetch('/api/v1/finance/wallet');
      const t = await financeFetch('/api/v1/finance/transactions');
      const wallet = w.wallet || {};
      state._wallet = wallet;
      box.innerHTML =
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">' +
        card('Available', wallet.available, wallet.currency, 'text-green-400') +
        card('Pending', wallet.pending, wallet.currency, 'text-amber-300') +
        card('Total earnings', wallet.totalEarnings, wallet.currency, 'text-white') +
        card('Withdrawn', wallet.totalWithdrawn, wallet.currency, 'text-slate-300') +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3 text-[11px]">' +
        '<div class="bg-[#131a28] rounded p-2">Guest token revenue<br><b class="text-white">' + wallet.totalGuestTokenRevenue + ' ' + wallet.currency + '</b></div>' +
        '<div class="bg-[#131a28] rounded p-2">Ad revenue<br><b class="text-white">' + wallet.totalAdRevenue + ' ' + wallet.currency + '</b></div>' +
        '<div class="bg-[#131a28] rounded p-2">Deposits<br><b class="text-white">' + wallet.totalDeposits + ' ' + wallet.currency + '</b></div>' +
        '</div>' +
        '<div class="flex flex-wrap gap-2 mb-3">' +
        '<button type="button" onclick="financeDeposit()" class="px-3 py-1.5 rounded bg-green-700 text-white text-[11px] font-semibold">Deposit / Fund</button>' +
        '<button type="button" onclick="navigateTo(\'withdraw\')" class="px-3 py-1.5 rounded bg-blue-800 text-white text-[11px] font-semibold">Withdraw</button>' +
        '<button type="button" onclick="loadWalletDashboard()" class="px-3 py-1.5 rounded bg-[#1e2a3a] text-slate-200 text-[11px]">Refresh</button>' +
        '</div>' +
        '<div class="text-[12px] font-bold text-white mb-1">Transactions</div>' +
        '<div class="overflow-x-auto max-h-64 overflow-y-auto border border-[#1e2a3a] rounded">' +
        '<table class="w-full text-[10px]"><thead class="text-slate-500"><tr><th class="text-left p-1.5">Time</th><th class="text-left p-1.5">Type</th><th class="text-right p-1.5">Amount</th><th class="text-left p-1.5">Status</th><th class="text-left p-1.5">Ref</th></tr></thead><tbody>' +
        (t.transactions || []).map(function (tx) {
          return '<tr class="border-t border-[#1e2a3a]"><td class="p-1.5 text-slate-400">' + new Date(tx.createdAt).toLocaleString() + '</td><td class="p-1.5">' + tx.type + '</td><td class="p-1.5 text-right font-mono">' + tx.amount + ' ' + tx.currency + '</td><td class="p-1.5">' + badge(tx.status) + '</td><td class="p-1.5 font-mono text-slate-500">' + (tx.reference || '—') + '</td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<p class="text-[9px] text-slate-500 mt-2">Balances come from the server ledger. FINANCE_MODE=TEST uses simulated payments (no real money).</p>';
    } catch (e) {
      box.innerHTML = '<div class="text-amber-400 text-[11px] p-3">Finance API offline: ' + (e.message || e) + '<br><span class="text-slate-500">Start server on port 8787 (FINANCE_MODE=TEST).</span></div>';
    }
  }

  function card(label, val, cur, cls) {
    return '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3"><div class="text-[9px] text-slate-500">' + label + '</div><div class="text-[18px] font-bold ' + cls + '">' + val + ' <span class="text-[11px] text-slate-500">' + (cur || '') + '</span></div></div>';
  }
  function badge(st) {
    const c = st === 'COMPLETED' ? 'bg-green-900 text-green-300' : st === 'PENDING' ? 'bg-amber-900 text-amber-200' : 'bg-slate-800 text-slate-300';
    return '<span class="px-1.5 py-0.5 rounded text-[9px] ' + c + '">' + st + '</span>';
  }

  async function financeDeposit() {
    const amount = prompt('Deposit amount', '100');
    if (amount === null || amount === '') return;
    const currency = prompt('Currency (KES for Kenya / M-Pesa, or USD etc.)', 'KES') || 'KES';
    try {
      const init = await financeFetch('/api/v1/finance/payments/initiate', {
        method: 'POST',
        body: { amount: Number(amount), currency: currency, purpose: 'wallet_deposit' }
      });
      const providerLabel = (init.provider || 'unknown').toUpperCase();
      if (init.provider === 'test' && init.testCompleteUrl) {
        if (!confirm('TEST mode (' + providerLabel + '): simulate payment of ' + amount + ' ' + currency + '?\nRef: ' + (init.reference || '')) ) return;
        await financeFetch(init.testCompleteUrl, { method: 'POST', body: {} });
        if (typeof pushNotification === 'function') pushNotification('Wallet', 'Deposit completed (TEST · ' + providerLabel + ')', 'ok');
      } else if (init.ok === false) {
        alert((init.message || 'Payment not configured') + '\nUse FINANCE_MODE=TEST or set provider credentials on the server.');
        return;
      } else {
        alert((init.message || 'Payment initiated') + '\nProvider: ' + providerLabel + '\nRef: ' + (init.reference || ''));
      }
      if (typeof loadWalletDashboard === 'function') loadWalletDashboard();
      if (typeof loadEarningsDashboard === 'function') loadEarningsDashboard();
      if (typeof loadWithdrawDashboard === 'function') loadWithdrawDashboard();
      if (typeof loadHomeFinanceSnapshot === 'function') loadHomeFinanceSnapshot();
    } catch (e) {
      alert('Deposit failed: ' + e.message);
    }
  }

  async function loadEarningsDashboard() {
    const box = document.getElementById('earnings-dashboard');
    if (!box) return;
    box.innerHTML = '<div class="text-slate-500 text-[11px] p-2">Loading earnings…</div>';
    try {
      const w = await financeFetch('/api/v1/finance/wallet');
      const t = await financeFetch('/api/v1/finance/transactions');
      let payments = { payments: [] };
      try { payments = await financeFetch('/api/v1/finance/payments'); } catch (e) {}
      const txs = (t.transactions || []).filter(function (x) {
        return x.type === 'GUEST_TOKEN_REVENUE' || x.type === 'AD_REVENUE' ||
          x.type === 'EARNINGS_SETTLE_IN' || x.type === 'EARNINGS_SETTLE_OUT';
      });
      const wallet = w.wallet || {};
      box.innerHTML =
        '<div class="text-[12px] text-slate-400 mb-2">Eligible earnings (guest tokens & ads): <b class="text-white">60% creator</b> / <b class="text-white">40% platform</b>. New revenue goes to <b class="text-amber-300">Pending</b> until you settle.</div>' +
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">' +
        card('Pending earnings', wallet.pending, wallet.currency, 'text-amber-300') +
        card('Available to withdraw', wallet.available, wallet.currency, 'text-green-400') +
        card('Guest token total', wallet.totalGuestTokenRevenue, wallet.currency, 'text-cyan-300') +
        card('Ad revenue total', wallet.totalAdRevenue, wallet.currency, 'text-amber-200') +
        '</div>' +
        '<div class="flex flex-wrap gap-2 mb-3">' +
        '<button type="button" onclick="financeSettleEarnings()" class="px-3 py-1.5 rounded bg-green-700 text-white text-[11px] font-semibold">Settle pending → available</button>' +
        '<button type="button" onclick="navigateTo(\'withdraw\')" class="px-3 py-1.5 rounded bg-blue-800 text-white text-[11px] font-semibold">Withdraw</button>' +
        '<button type="button" onclick="financeDeposit()" class="px-3 py-1.5 rounded bg-[#1e2a3a] text-slate-200 text-[11px]">Fund wallet</button>' +
        '<button type="button" onclick="loadEarningsDashboard()" class="px-3 py-1.5 rounded bg-[#1e2a3a] text-slate-200 text-[11px]">Refresh</button>' +
        '<button type="button" onclick="exportEarningsCsv()" class="px-3 py-1.5 rounded bg-[#1e2a3a] text-slate-200 text-[11px]">Export CSV</button>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        '<div><div class="text-[12px] font-bold text-white mb-1">Revenue & settlements</div>' +
        '<div class="space-y-1 max-h-56 overflow-y-auto">' +
        (txs.map(function (tx) {
          const g = tx.metadata && tx.metadata.gross;
          const p = tx.metadata && tx.metadata.platform;
          const c = tx.metadata && tx.metadata.creator;
          return '<div class="text-[10px] bg-[#131a28] rounded p-2 border border-[#1e2a3a]">' +
            '<div class="flex justify-between"><span class="text-white">' + tx.type + '</span><span class="font-mono">' + tx.amount + ' ' + tx.currency + '</span></div>' +
            (g != null ? '<div class="text-slate-500">gross ' + (g / 100).toFixed(2) + ' · platform 40% ' + (p / 100).toFixed(2) + ' · you 60% ' + (c / 100).toFixed(2) + '</div>' : '') +
            '<div class="text-slate-600">' + new Date(tx.createdAt).toLocaleString() + '</div></div>';
        }).join('') || '<div class="text-slate-500 text-[11px]">No earnings events yet — play ads or sell guest tokens</div>') +
        '</div></div>' +
        '<div><div class="text-[12px] font-bold text-white mb-1">Payments</div>' +
        '<div class="space-y-1 max-h-56 overflow-y-auto">' +
        ((payments.payments || []).map(function (p) {
          return '<div class="text-[10px] bg-[#131a28] rounded p-2 border border-[#1e2a3a]">' +
            '<div class="flex justify-between"><span class="text-white">' + p.purpose + '</span>' + badge(p.status) + '</div>' +
            '<div class="font-mono">' + p.amount + ' ' + p.currency + ' · ' + (p.provider || '') + '</div>' +
            '<div class="text-slate-600">' + (p.reference || '') + ' · ' + new Date(p.createdAt).toLocaleString() + '</div></div>';
        }).join('') || '<div class="text-slate-500 text-[11px]">No payment records</div>') +
        '</div></div></div>';
    } catch (e) {
      box.innerHTML = '<div class="text-amber-400 text-[11px] p-2">' + e.message + '</div>';
    }
  }

  async function financeSettleEarnings() {
    if (!confirm('Move all pending earnings to available balance for withdrawal?')) return;
    try {
      const r = await financeFetch('/api/v1/finance/earnings/settle', { method: 'POST', body: {} });
      if (typeof pushNotification === 'function') {
        pushNotification('Earnings', 'Settled ' + r.settled + ' to available', 'ok');
      }
      loadEarningsDashboard();
      if (typeof loadWalletDashboard === 'function') loadWalletDashboard();
      if (typeof loadHomeFinanceSnapshot === 'function') loadHomeFinanceSnapshot();
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadSubscriptionDashboard() {
    const box = document.getElementById('subscription-dashboard');
    if (!box) return;
    try {
      const sub = await financeFetch('/api/v1/finance/subscription');
      const plans = await financeFetch('/api/v1/finance/plans');
      box.innerHTML =
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3 mb-3">' +
        '<div class="text-[11px] text-slate-500">Current plan</div>' +
        '<div class="text-[18px] font-bold text-white">' + (sub.plan && sub.plan.name) + '</div>' +
        '<div class="text-[11px] text-slate-400">Status: ' + (sub.subscription && sub.subscription.status) + '</div>' +
        '<div class="mt-2 flex flex-wrap gap-1">' +
        Object.keys((sub.plan && sub.plan.features) || {}).filter(function (k) { return sub.plan.features[k]; }).map(function (k) {
          return '<span class="text-[9px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-300">' + k + '</span>';
        }).join('') +
        '</div></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-2">' +
        (plans.plans || []).map(function (p) {
          return '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3">' +
            '<div class="text-[14px] font-bold text-white">' + p.name + '</div>' +
            '<div class="text-[11px] text-slate-400 mb-2">' + p.description + '</div>' +
            '<div class="text-[16px] text-cyan-300 font-bold mb-2">' + p.price + ' ' + p.currency + '<span class="text-[10px] text-slate-500"> / ' + p.billingPeriod + '</span></div>' +
            '<button type="button" onclick="financeBuyPlan(\'' + p.id + '\')" class="w-full py-1.5 rounded bg-blue-700 text-white text-[11px] font-semibold">Select</button></div>';
        }).join('') +
        '</div>';
    } catch (e) {
      box.innerHTML = '<div class="text-amber-400 text-[11px]">' + e.message + '</div>';
    }
  }

  async function financeBuyPlan(planId) {
    if (!confirm('Purchase plan ' + planId + '?')) return;
    try {
      const init = await financeFetch('/api/v1/finance/subscription/purchase', { method: 'POST', body: { planId: planId } });
      if (init.provider === 'test' && init.testCompleteUrl) {
        await financeFetch(init.testCompleteUrl, { method: 'POST', body: {} });
        if (typeof pushNotification === 'function') pushNotification('Subscription', 'Activated (TEST)', 'ok');
      } else {
        alert(init.message || 'Payment initiated');
      }
      loadSubscriptionDashboard();
    } catch (e) {
      alert(e.message);
    }
  }

  async function financeSetPin() {
    const pin = prompt('Set 4–6 digit withdrawal PIN (not shown again)');
    if (!pin) return;
    try {
      await financeFetch('/api/v1/finance/pin', { method: 'POST', body: { pin: pin } });
      alert('PIN set on server (hashed).');
    } catch (e) { alert(e.message); }
  }

  async function financeAddDest() {
    const phone = prompt('M-Pesa phone (+254...)');
    if (!phone) return;
    try {
      const r = await financeFetch('/api/v1/finance/destinations', {
        method: 'POST',
        body: { type: 'mpesa_phone', details: { phone: phone } }
      });
      state._lastDestId = r.destination && r.destination.id;
      alert('Destination added. Security hold until: ' + new Date(r.destination.availableAt).toLocaleString());
    } catch (e) { alert(e.message); }
  }

  async function loadWithdrawDashboard() {
    const box = document.getElementById('withdraw-dashboard');
    if (!box) return;
    box.innerHTML = '<div class="text-slate-500 text-[11px] p-2">Loading…</div>';
    try {
      const w = await financeFetch('/api/v1/finance/wallet');
      let dests = { destinations: [] };
      try { dests = await financeFetch('/api/v1/finance/destinations'); } catch (e) {}
      const wallet = w.wallet || {};
      const cfg = w.config || {};
      const minW = cfg.minWithdrawal != null ? cfg.minWithdrawal : '100.00';
      const fee = cfg.withdrawalFee != null ? cfg.withdrawalFee : '0.00';
      state._wallet = wallet;
      state._withdrawConfig = cfg;
      box.innerHTML =
        '<div class="grid grid-cols-2 gap-2 mb-3">' +
        card('Available', wallet.available, wallet.currency, 'text-green-400') +
        card('Pending', wallet.pending, wallet.currency, 'text-amber-300') +
        '</div>' +
        '<div class="text-[10px] text-slate-500 mb-2">Min withdrawal: <b class="text-slate-300">' + minW + ' ' + (cfg.currency || 'KES') +
        '</b> · Fee: ' + fee + ' · Mode: ' + (cfg.mode || '—') + '</div>' +
        '<div class="text-[12px] font-bold text-white mb-1">Destinations</div>' +
        '<div class="space-y-1 mb-3 max-h-32 overflow-y-auto">' +
        ((dests.destinations || []).map(function (d) {
          const ready = d.ready ? 'ready' : ('hold until ' + new Date(d.availableAt).toLocaleString());
          const sel = state._lastDestId === d.id ? ' border-green-600' : '';
          return '<button type="button" data-dest="' + d.id + '" class="wd-dest-btn w-full text-left text-[10px] px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a]' + sel + '">' +
            (d.type || 'dest') + ' · ' + (d.details && d.details.phone ? d.details.phone : d.id.slice(0, 8)) +
            ' · <span class="' + (d.ready ? 'text-green-400' : 'text-amber-400') + '">' + ready + '</span></button>';
        }).join('') || '<div class="text-slate-500 text-[10px]">No destinations — add M-Pesa below</div>') +
        '</div>' +
        '<div class="space-y-2">' +
        '<button type="button" onclick="financeSetPin()" class="w-full py-2 rounded bg-[#1e2a3a] text-slate-200 text-[11px]">Set / change withdrawal PIN</button>' +
        '<button type="button" onclick="financeAddDest()" class="w-full py-2 rounded bg-[#1e2a3a] text-slate-200 text-[11px]">Add M-Pesa destination</button>' +
        '<button type="button" onclick="financeWithdraw()" class="w-full py-2 rounded bg-blue-700 text-white text-[11px] font-semibold">Request withdrawal</button>' +
        '<button type="button" onclick="exportEarningsCsv()" class="w-full py-2 rounded bg-[#1e2a3a] text-slate-200 text-[11px]">Export earnings CSV</button>' +
        '</div>' +
        '<div class="text-[12px] font-bold text-white mt-3 mb-1">My withdrawal requests</div>' +
        '<div id="wd-history" class="space-y-1 max-h-40 overflow-y-auto text-[10px] text-slate-500">Loading…</div>' +
        '<p class="text-[9px] text-slate-500 mt-2">PIN is hashed server-side. Only <b>available</b> balance can be withdrawn (settle pending first).</p>';
      try {
        const hist = await financeFetch('/api/v1/finance/withdrawals');
        const h = document.getElementById('wd-history');
        if (h) {
          const rows = hist.withdrawals || [];
          h.innerHTML = rows.map(function (w) {
            return '<div class="flex flex-wrap justify-between gap-2 bg-[#131a28] border border-[#1e2a3a] rounded px-2 py-1">' +
              '<span class="font-mono">' + w.amount + ' ' + w.currency +
              (w.fee && Number(w.fee) > 0 ? ' · fee ' + w.fee + ' · net ' + w.net : '') + '</span>' +
              badge(w.status) +
              '<span class="text-slate-600">' + new Date(w.createdAt).toLocaleString() + '</span></div>';
          }).join('') || '<div class="text-slate-500">No withdrawals yet</div>';
        }
      } catch (err) {
        const h = document.getElementById('wd-history');
        if (h) h.textContent = 'History unavailable';
      }
      box.querySelectorAll('.wd-dest-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state._lastDestId = btn.getAttribute('data-dest');
          loadWithdrawDashboard();
        });
      });
    } catch (e) {
      box.innerHTML = '<div class="text-amber-400 text-[11px] p-2">' + (e.message || e) + '</div>';
    }
  }

  async function financeWithdraw() {
    try {
      const w = await financeFetch('/api/v1/finance/wallet');
      const available = w.wallet && w.wallet.available;
      const minW = w.config && w.config.minWithdrawal;
      const fee = (w.config && w.config.withdrawalFee) != null ? Number(w.config.withdrawalFee) : 0;
      const amount = prompt('Withdrawal amount (available: ' + available + ' ' + (w.wallet.currency || 'KES') + ', min ' + minW + ', fee ' + fee + ')', available || '100');
      if (amount === null || amount === '') return;
      const gross = Number(amount);
      const net = Math.max(0, gross - fee);
      if (!confirm('Withdraw ' + gross + ' ' + (w.wallet.currency || 'KES') + '?\nFee: ' + fee + '\nYou receive (net): ' + net.toFixed(2))) return;
      const pin = prompt('Withdrawal PIN');
      if (!pin) return;
      if (!state._lastDestId) {
        // try first ready destination
        try {
          const dests = await financeFetch('/api/v1/finance/destinations');
          const ready = (dests.destinations || []).find(function (d) { return d.ready; }) || (dests.destinations || [])[0];
          if (ready) state._lastDestId = ready.id;
        } catch (e) {}
      }
      if (!state._lastDestId) {
        alert('Add a withdrawal destination first');
        return;
      }
      await financeFetch('/api/v1/finance/withdrawals', {
        method: 'POST',
        body: { amount: Number(amount), currency: (w.wallet && w.wallet.currency) || 'KES', destinationId: state._lastDestId, pin: pin }
      });
      if (typeof pushNotification === 'function') pushNotification('Withdraw', 'Request submitted (PENDING)', 'ok');
      else alert('Withdrawal request submitted (PENDING).');
      loadWithdrawDashboard();
      if (typeof loadWalletDashboard === 'function') loadWalletDashboard();
      if (typeof loadEarningsDashboard === 'function') loadEarningsDashboard();
      if (typeof loadHomeFinanceSnapshot === 'function') loadHomeFinanceSnapshot();
    } catch (e) { alert(e.message); }
  }

  async function exportEarningsCsv() {
    try {
      const t = await financeFetch('/api/v1/finance/transactions');
      const rows = (t.transactions || []).filter(function (x) {
        return /REVENUE|SETTLE|WITHDRAWAL|DEPOSIT/i.test(x.type || '');
      });
      const lines = ['createdAt,type,amount,currency,status,reference,description'];
      rows.forEach(function (tx) {
        lines.push([
          new Date(tx.createdAt).toISOString(),
          tx.type,
          tx.amount,
          tx.currency,
          tx.status,
          '"' + String(tx.reference || '').replace(/"/g, '') + '"',
          '"' + String(tx.description || '').replace(/"/g, '') + '"'
        ].join(','));
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bb-earnings-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      if (typeof pushNotification === 'function') pushNotification('Earnings', 'CSV exported', 'ok');
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  }

  async function financeCreatePaidGuestLink() {
    const price = prompt('Guest token price (KES, 0 = free)', '50');
    if (price === null) return;
    try {
      // Feature gate check
      try {
        const feat = await financeFetch('/api/v1/finance/features/paid_guest_tokens');
        if (Number(price) > 0 && feat && feat.allowed === false) {
          alert('Paid guest tokens require the Professional plan or higher. Upgrade under Plans.');
          if (typeof navigateTo === 'function') navigateTo('subscriptions');
          return;
        }
      } catch (e) {}
      const r = await financeFetch('/api/v1/finance/guest-tokens', {
        method: 'POST',
        body: { price: Number(price), expiresInHours: 24, maxUses: 1 }
      });
      const full = (typeof appPageUrl === 'function')
        ? appPageUrl('guest.html', 'token=' + encodeURIComponent(r.token))
        : ('guest.html?token=' + r.token);
      if (navigator.clipboard) navigator.clipboard.writeText(full).catch(function () {});
      if (typeof pushNotification === 'function') pushNotification('Guests', 'Token created · link copied', 'ok');
      alert('Guest link created:\n' + full + '\nPrice: ' + (r.priceMinor / 100) + ' KES');
      if (typeof loadGuestTokensPanel === 'function') loadGuestTokensPanel();
    } catch (e) {
      alert(e.message);
      if (String(e.message || '').indexOf('Professional') >= 0 && typeof navigateTo === 'function') {
        navigateTo('subscriptions');
      }
    }
  }

  window.clientHasFeature = clientHasFeature;
  window.requireFeature = requireFeature;
  async function loadHomeFinanceSnapshot() {
    const box = document.getElementById('home-finance-snapshot');
    if (!box) return;
    try {
      const w = await financeFetch('/api/v1/finance/wallet');
      const wallet = w.wallet || {};
      box.innerHTML =
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-2">' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-2"><div class="text-[9px] text-slate-500">Available</div><div class="text-[14px] font-bold text-green-400">' + wallet.available + ' <span class="text-[10px] text-slate-500">' + wallet.currency + '</span></div></div>' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-2"><div class="text-[9px] text-slate-500">Pending earnings</div><div class="text-[14px] font-bold text-amber-300">' + wallet.pending + '</div></div>' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-2"><div class="text-[9px] text-slate-500">Guest token earn</div><div class="text-[14px] font-bold text-cyan-300">' + wallet.totalGuestTokenRevenue + '</div></div>' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-2"><div class="text-[9px] text-slate-500">Ad earn</div><div class="text-[14px] font-bold text-amber-200">' + wallet.totalAdRevenue + '</div></div>' +
        '</div>' +
        '<div class="flex gap-2 mt-2">' +
        '<button type="button" onclick="navigateTo(\'wallet\')" class="text-[10px] px-2 py-1 rounded bg-[#1e2a3a] text-slate-200">Wallet</button>' +
        '<button type="button" onclick="navigateTo(\'earnings\')" class="text-[10px] px-2 py-1 rounded bg-[#1e2a3a] text-slate-200">Earnings</button>' +
        '<button type="button" onclick="navigateTo(\'withdraw\')" class="text-[10px] px-2 py-1 rounded bg-blue-900 text-blue-100">Withdraw</button>' +
        '</div>';
    } catch (e) {
      box.innerHTML = '<div class="text-[10px] text-slate-500">Finance offline — start server for wallet snapshot. ' + (e.message || '') + '</div>';
    }
  }
  window.loadHomeFinanceSnapshot = loadHomeFinanceSnapshot;
  async function checkFinanceHealth() {
    const el = document.getElementById('set-finance-health');
    if (el) { el.textContent = 'Checking…'; el.className = 'text-[10px] text-slate-400'; }
    try {
      const data = await financeFetch('/api/v1/finance/health');
      const mode = (data.mode || '—').toUpperCase();
      const txt = 'Online · mode ' + mode + (data.rateLimit ? ' · rate-limit on' : '');
      if (el) {
        el.textContent = txt;
        el.className = 'text-[10px] ' + (mode === 'TEST' ? 'text-amber-300' : 'text-green-400');
      }
      if (typeof pushNotification === 'function') {
        pushNotification('Finance', txt, mode === 'TEST' ? 'warn' : 'ok');
      }
      if (typeof updateFinanceNavBadge === 'function') updateFinanceNavBadge();
      return data;
    } catch (e) {
      if (el) {
        el.textContent = 'Offline: ' + (e.message || e);
        el.className = 'text-[10px] text-red-400';
      }
      return null;
    }
  }
  async function updateFinanceNavBadge() {
    const badge = document.getElementById('nav-finance-badge');
    if (!badge) return;
    try {
      const h = await financeFetch('/api/v1/finance/health');
      const mode = (h.mode || '').toUpperCase();
      badge.textContent = mode === 'TEST' ? 'TEST' : 'LIVE';
      badge.className = 'text-[8px] px-1 rounded ' + (mode === 'TEST' ? 'bg-amber-900 text-amber-200' : 'bg-green-900 text-green-200');
      badge.classList.remove('hidden');
    } catch (e) {
      badge.textContent = 'OFF';
      badge.className = 'text-[8px] px-1 rounded bg-slate-800 text-slate-400';
      badge.classList.remove('hidden');
    }
  }
  window.updateFinanceNavBadge = updateFinanceNavBadge;
  window.checkFinanceHealth = checkFinanceHealth;
  window.financeFetch = financeFetch;
  window.loadWalletDashboard = loadWalletDashboard;
  window.loadEarningsDashboard = loadEarningsDashboard;
  window.loadSubscriptionDashboard = loadSubscriptionDashboard;
  window.financeDeposit = financeDeposit;
  window.financeSettleEarnings = financeSettleEarnings;
  window.financeBuyPlan = financeBuyPlan;
  window.financeSetPin = financeSetPin;
  window.financeAddDest = financeAddDest;
  window.financeWithdraw = financeWithdraw;
  window.loadWithdrawDashboard = loadWithdrawDashboard;
  window.exportEarningsCsv = exportEarningsCsv;
  async function reportAdRevenue(ad, opts) {
    opts = opts || {};
    if (!ad) return;
    // Default TEST rate card: KES 10 per play (configurable later)
    const gross = opts.grossAmount != null ? opts.grossAmount : 10;
    try {
      const playId = opts.playId || (ad.id + '_' + Date.now());
      const r = await financeFetch('/api/v1/finance/revenue/ad', {
        method: 'POST',
        body: {
          adId: ad.id,
          campaignId: ad.campaign,
          grossAmount: gross,
          currency: 'KES',
          playId: playId,
          idempotencyKey: 'adplay_' + playId,
          creatorId: currentFinanceUserId()
        }
      });
      if (typeof pushNotification === 'function') {
        pushNotification('Ad revenue', r.duplicate ? 'Already recorded' : ('Credited 60% of KES ' + gross), r.duplicate ? 'info' : 'ok');
      }
      return r;
    } catch (e) {
      console.warn('Ad revenue report failed', e);
      return null;
    }
  }
  window.reportAdRevenue = reportAdRevenue;
  window.financeCreatePaidGuestLink = financeCreatePaidGuestLink;

  async function loadAdminFinance() {
    const box = document.getElementById('admin-finance-dashboard');
    if (!box) return;
    // Prefer admin id for this page
    const prev = state.currentUserId;
    state.currentUserId = 'admin';
    box.innerHTML = '<div class="text-slate-500 p-2">Loading admin finance…</div>';
    try {
      const overview = await financeFetch('/api/v1/finance/admin/overview');
      const wds = await financeFetch('/api/v1/finance/admin/withdrawals');
      const p = overview.platform || {};
      box.innerHTML =
        '<div class="text-[10px] text-amber-300/90 mb-2">Mode: ' + (overview.mode || '—') + ' · Acting as admin for this request</div>' +
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3"><div class="text-[9px] text-slate-500">Platform available</div><div class="text-[18px] font-bold text-green-400">' + p.available + '</div></div>' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3"><div class="text-[9px] text-slate-500">Guest token (40%)</div><div class="text-[18px] font-bold text-cyan-300">' + p.guestTokenRevenue + '</div></div>' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3"><div class="text-[9px] text-slate-500">Ad revenue (40%)</div><div class="text-[18px] font-bold text-amber-300">' + p.adRevenue + '</div></div>' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3"><div class="text-[9px] text-slate-500">Subscriptions</div><div class="text-[18px] font-bold text-white">' + p.subscriptionRevenue + '</div></div>' +
        '<div class="bg-[#0f1520] border border-[#1e2a3a] rounded-lg p-3"><div class="text-[9px] text-slate-500">Withdrawal fees</div><div class="text-[18px] font-bold text-amber-200">' + (p.withdrawalFees || '0.00') + '</div></div>' +
        '</div>' +
        '<div class="text-[12px] font-bold text-white mb-1">Withdrawals</div>' +
        '<div class="space-y-1 max-h-72 overflow-y-auto">' +
        ((wds.withdrawals || []).map(function (wd) {
          return '<div class="flex flex-wrap items-center justify-between gap-2 bg-[#131a28] border border-[#1e2a3a] rounded p-2 text-[10px]">' +
            '<div><span class="text-white font-mono">' + wd.id.slice(0, 8) + '…</span> · user ' + wd.userId +
            ' · <b>' + (wd.amount != null ? wd.amount : (wd.amountMinor / 100).toFixed(2)) + ' ' + wd.currency + '</b>' +
            (wd.fee && Number(wd.fee) > 0 ? ' · net ' + wd.net : '') +
            ' · ' + wd.status + '</div>' +
            '<div class="flex flex-wrap gap-1">' +
            '<button type="button" class="px-1.5 py-0.5 rounded bg-amber-900 text-amber-100" onclick="adminWd(\'' + wd.id + '\',\'UNDER_REVIEW\')">Review</button>' +
            '<button type="button" class="px-1.5 py-0.5 rounded bg-blue-900 text-blue-100" onclick="adminWd(\'' + wd.id + '\',\'APPROVED\')">Approve</button>' +
            '<button type="button" class="px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-100" onclick="adminWd(\'' + wd.id + '\',\'PROCESSING\')">Process</button>' +
            '<button type="button" class="px-1.5 py-0.5 rounded bg-green-800 text-white" onclick="adminWd(\'' + wd.id + '\',\'COMPLETED\')">Complete</button>' +
            '<button type="button" class="px-1.5 py-0.5 rounded bg-red-900 text-red-100" onclick="adminWd(\'' + wd.id + '\',\'REJECTED\')">Reject</button>' +
            '</div></div>';
        }).join('') || '<div class="text-slate-500">No withdrawals yet</div>') +
        '</div>' +
        '<p class="text-[9px] text-slate-500 mt-2">Admin actions write ledger entries. Completing a withdrawal does not send real M-Pesa until provider payout is wired.</p>' +
        '<div class="mt-4 p-3 rounded border border-[#1e2a3a] bg-[#0f1520]">' +
        '<div class="text-[12px] font-bold text-white mb-2">Payout config</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">' +
        '<label class="text-slate-400">Min withdrawal<input id="adm-min-wd" type="number" step="0.01" class="w-full mt-0.5 px-2 py-1 rounded bg-[#0a0e17] border border-[#2a3a4f] text-white" /></label>' +
        '<label class="text-slate-400">Withdrawal fee<input id="adm-wd-fee" type="number" step="0.01" class="w-full mt-0.5 px-2 py-1 rounded bg-[#0a0e17] border border-[#2a3a4f] text-white" /></label>' +
        '<label class="text-slate-400">Default guest token price<input id="adm-gt-price" type="number" step="0.01" class="w-full mt-0.5 px-2 py-1 rounded bg-[#0a0e17] border border-[#2a3a4f] text-white" /></label>' +
        '</div>' +
        '<button type="button" onclick="adminFinanceSaveConfig()" class="mt-2 px-3 py-1.5 rounded bg-blue-700 text-white text-[11px] font-semibold">Save config</button>' +
        '<div id="adm-cfg-msg" class="text-[10px] text-slate-500 mt-1"></div></div>';
      try {
        const cfg = await financeFetch('/api/v1/finance/admin/config');
        const c = cfg.config || {};
        const elMin = document.getElementById('adm-min-wd'); if (elMin) elMin.value = c.minWithdrawal;
        const elFee = document.getElementById('adm-wd-fee'); if (elFee) elFee.value = c.withdrawalFee;
        const elGt = document.getElementById('adm-gt-price'); if (elGt) elGt.value = c.defaultGuestTokenPrice;
      } catch (cfgErr) {}
      try {
        const aud = await financeFetch('/api/v1/finance/admin/audit');
        const wrap = document.createElement('div');
        wrap.className = 'mt-4';
        wrap.innerHTML = '<div class="text-[12px] font-bold text-white mb-1">Finance audit</div><div class="max-h-48 overflow-y-auto space-y-1 text-[10px]" id="adm-fin-audit"></div>';
        box.appendChild(wrap);
        const list = document.getElementById('adm-fin-audit');
        list.innerHTML = (aud.events || []).map(function (ev) {
          return '<div class="bg-[#131a28] border border-[#1e2a3a] rounded px-2 py-1 flex flex-wrap gap-2 justify-between">' +
            '<span class="text-cyan-300">' + (ev.action || '') + '</span>' +
            '<span class="text-slate-400">actor ' + (ev.actor || '') + '</span>' +
            '<span class="text-slate-600">' + (ev.at ? new Date(ev.at).toLocaleString() : '') + '</span></div>';
        }).join('') || '<div class="text-slate-500">No audit events yet</div>';
        const expBtn = document.createElement('button');
        expBtn.type = 'button';
        expBtn.className = 'mt-2 px-2 py-1 rounded bg-[#1e2a3a] text-slate-200 text-[10px]';
        expBtn.textContent = 'Export audit CSV';
        expBtn.onclick = function () { exportFinanceAuditCsv(aud.events || []); };
        wrap.appendChild(expBtn);
      } catch (audErr) {}
    } catch (e) {
      box.innerHTML = '<div class="text-amber-400 p-2">' + (e.message || e) + '<br><span class="text-slate-500">Start finance server. Admin routes need user id <code class="text-slate-300">admin</code>.</span></div>';
    } finally {
      if (prev) state.currentUserId = prev;
    }
  }

  async function adminFinanceSaveConfig() {
    const prev = state.currentUserId;
    state.currentUserId = 'admin';
    const msg = document.getElementById('adm-cfg-msg');
    try {
      const body = {
        minWithdrawal: Number((document.getElementById('adm-min-wd') || {}).value),
        withdrawalFee: Number((document.getElementById('adm-wd-fee') || {}).value),
        defaultGuestTokenPrice: Number((document.getElementById('adm-gt-price') || {}).value)
      };
      await financeFetch('/api/v1/finance/admin/config', { method: 'POST', body: body });
      if (msg) { msg.textContent = 'Config saved.'; msg.className = 'text-[10px] text-green-400 mt-1'; }
      if (typeof pushNotification === 'function') pushNotification('Admin', 'Payout config saved', 'ok');
    } catch (e) {
      if (msg) { msg.textContent = e.message; msg.className = 'text-[10px] text-red-400 mt-1'; }
    } finally {
      state.currentUserId = prev;
    }
  }

  async function adminWd(id, status) {
    const prev = state.currentUserId;
    state.currentUserId = 'admin';
    try {
      await financeFetch('/api/v1/finance/admin/withdrawals/' + id, { method: 'POST', body: { status: status } });
      if (typeof pushNotification === 'function') pushNotification('Admin', 'Withdrawal ' + status, 'ok');
      loadAdminFinance();
    } catch (e) {
      alert(e.message);
    } finally {
      state.currentUserId = prev;
    }
  }

  async function loadGuestTokensPanel() {
    const box = document.getElementById('guest-tokens-panel');
    if (!box) return;
    box.innerHTML = '<div class="text-slate-500 text-[10px] p-2">Loading tokens…</div>';
    try {
      const data = await financeFetch('/api/v1/finance/guest-tokens');
      const rows = data.tokens || [];
      if (!rows.length) {
        box.innerHTML = '<div class="text-slate-500 text-[10px] p-2">No guest tokens yet. Use <b>Paid guest token</b>.</div>';
        return;
      }
      box.innerHTML = rows.map(function (t) {
        const price = ((t.priceMinor || 0) / 100).toFixed(2) + ' ' + (t.currency || 'KES');
        const exp = t.expiresAt ? new Date(t.expiresAt).toLocaleString() : '—';
        const st = t.revokedAt ? 'revoked' : (t.paymentStatus || t.status);
        const link = (typeof appPageUrl === 'function')
          ? appPageUrl('guest.html', 'token=' + encodeURIComponent(t.token))
          : ('guest.html?token=' + t.token);
        return '<div class="flex flex-wrap items-center justify-between gap-1 px-2 py-1.5 rounded bg-[#131a28] border border-[#1e2a3a] text-[10px] mb-1">' +
          '<div class="min-w-0">' +
          '<div class="text-white font-medium truncate">' + st + ' · ' + price + ' · uses ' + (t.uses || 0) + '/' + (t.maxUses || 1) + '</div>' +
          '<div class="font-mono text-[9px] text-slate-500 truncate">' + t.token.slice(0, 16) + '…</div>' +
          '<div class="text-[9px] text-slate-600">exp ' + exp + '</div></div>' +
          '<div class="flex gap-0.5 shrink-0">' +
          '<button type="button" class="px-1.5 py-0.5 rounded bg-blue-900 text-blue-100" onclick="navigator.clipboard.writeText(\'' + link.replace(/'/g, '') + '\')">Copy</button>' +
          (!t.revokedAt ? '<button type="button" class="px-1.5 py-0.5 rounded bg-red-950 text-red-200" onclick="financeRevokeGuestToken(\'' + t.id + '\')">Revoke</button>' : '') +
          '</div></div>';
      }).join('');
    } catch (e) {
      box.innerHTML = '<div class="text-amber-400 text-[10px] p-2">' + (e.message || e) + '</div>';
    }
  }

  async function financeRevokeGuestToken(id) {
    if (!confirm('Revoke this guest token?')) return;
    try {
      await financeFetch('/api/v1/finance/guest-tokens/' + id + '/revoke', { method: 'POST', body: {} });
      if (typeof pushNotification === 'function') pushNotification('Guests', 'Token revoked', 'ok');
      loadGuestTokensPanel();
    } catch (e) {
      alert(e.message);
    }
  }

  window.loadGuestTokensPanel = loadGuestTokensPanel;
  window.financeRevokeGuestToken = financeRevokeGuestToken;
  window.loadAdminFinance = loadAdminFinance;
  window.adminWd = adminWd;
  function exportFinanceAuditCsv(events) {
    const lines = ['at,action,actor,target,result'];
    (events || []).forEach(function (ev) {
      lines.push([
        ev.at ? new Date(ev.at).toISOString() : '',
        ev.action || '',
        ev.actor || '',
        '"' + String(ev.target || '').replace(/"/g, '') + '"',
        ev.result || ''
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bb-finance-audit-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }
  window.exportFinanceAuditCsv = exportFinanceAuditCsv;
  window.adminFinanceSaveConfig = adminFinanceSaveConfig;
})();
