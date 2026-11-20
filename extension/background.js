// TDE Clip – service worker: jedyne miejsce, które rozmawia z lokalnym silnikiem.
const BASE = 'http://127.0.0.1:8770';
const HOST = 'com.tde.clip';
let starting = null;

async function rawFetch(method, path, body) {
  const init = { method, cache: 'no-store', headers: {} };
  if (method === 'POST') {
    init.headers['Content-Type'] = 'application/json';
    init.headers['X-TDE-Clip'] = '1';
    init.body = JSON.stringify(body || {});
  }
  const r = await fetch(BASE + path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || ('HTTP ' + r.status), http: true };
  return { ok: true, data };
}

// Silnik nie działa → poproś hosta natywnego o start (raz naraz).
function startEngine() {
  if (starting) return starting;
  starting = new Promise(resolve => {
    try {
      chrome.runtime.sendNativeMessage(HOST, { cmd: 'start' }, res => {
        const err = chrome.runtime.lastError;
        resolve(err ? { ok: false, error: err.message } : (res || { ok: false }));
      });
    } catch (e) { resolve({ ok: false, error: String(e) }); }
  }).finally(() => setTimeout(() => { starting = null; }, 1500));
  return starting;
}

async function api(method, path, body, allowStart) {
  try {
    return await rawFetch(method, path, body);
  } catch (e) {
    if (!allowStart) return { ok: false, error: 'offline', offline: true };
    const s = await startEngine();
    if (!s.ok) return { ok: false, error: 'offline', offline: true, host: s.error || 'no-host' };
    try { return await rawFetch(method, path, body); }
    catch (e2) { return { ok: false, error: 'offline', offline: true }; }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return false;
  if (msg.type === 'api') {
    api(msg.method || 'GET', msg.path, msg.body, msg.start !== false).then(reply);
    return true;
  }
  if (msg.type === 'start') {
    startEngine().then(reply);
    return true;
  }
  if (msg.type === 'openApp') {
    chrome.tabs.create({ url: BASE + '/app/' + (msg.query ? '?q=' + encodeURIComponent(msg.query) : '') });
    reply({ ok: true });
    return false;
  }
  return false;
});

// Alt+D – otwórz panel na aktywnym filmie
chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && /youtube\.com\/(watch|shorts)/.test(tab.url || '')) chrome.tabs.sendMessage(tab.id, { type: 'togglePanel' }).catch(() => {});
});
