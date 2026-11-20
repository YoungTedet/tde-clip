/* TDE Clip – YouTube: przycisk „DaVinci” pod filmem + panel z opcjami. */
(() => {
  if (window.__tdeClipLoaded) return;
  window.__tdeClipLoaded = true;
  const TC = window.TDEClip;
  const RT = window.__tdeClipRuntime || chrome.runtime;
  const { h, icon } = TC;

  // ------------------------------------------------------------------ komunikacja z silnikiem (przez service worker)
  function send(msg) {
    return new Promise(res => {
      try {
        RT.sendMessage(msg, r => {
          const err = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError;
          res(r || { ok: false, error: err ? err.message : 'Brak odpowiedzi' });
        });
      } catch (e) {
        res({ ok: false, error: 'Rozszerzenie zostało zaktualizowane – odśwież stronę.', stale: true });
      }
    });
  }
  let lastFail = null;
  const api = {
    async get(path) { const r = await send({ type: 'api', method: 'GET', path }); if (!r.ok) { lastFail = r; throw new Error(r.error); } return r.data; },
    async post(path, body) { const r = await send({ type: 'api', method: 'POST', path, body }); if (!r.ok) { lastFail = r; throw new Error(r.error); } return r.data; }
  };

  // ------------------------------------------------------------------ odtwarzacz YouTube
  const videoEl = () => document.querySelector('#movie_player video.html5-main-video') || document.querySelector('#movie_player video');
  const adShowing = () => !!document.querySelector('#movie_player.ad-showing');
  const player = {
    getTime() { const v = videoEl(); return v && !adShowing() ? v.currentTime || 0 : 0; },
    getDuration() { const v = videoEl(); return v && !adShowing() && isFinite(v.duration) ? v.duration : 0; },
    seek(t) { const v = videoEl(); if (v && !adShowing()) v.currentTime = t; },
    play() { const v = videoEl(); if (v) { const p = v.play(); p && p.catch(() => {}); } },
    pause() { const v = videoEl(); if (v) v.pause(); },
    isPlaying() { const v = videoEl(); return !!(v && !v.paused); }
  };
  const videoId = () => window.__tdeClipDevId || (location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null);
  function currentVideo() {
    const id = videoId();
    const title = (document.querySelector('ytd-watch-metadata h1') || {}).textContent;
    const chan = document.querySelector('ytd-watch-metadata ytd-channel-name a') || document.querySelector('ytd-watch-metadata #owner #channel-name #text');
    return {
      id, url: 'https://www.youtube.com/watch?v=' + id,
      title: (title || document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '')).trim(),
      channel: chan ? chan.textContent.trim() : '',
      duration: Math.round(player.getDuration() * 1000) / 1000,
      thumb: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'
    };
  }
  const isDark = () => document.documentElement.hasAttribute('dark') || (!document.documentElement.hasAttribute('light') && matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('dark') !== null);

  // ------------------------------------------------------------------ przycisk pod filmem
  const BTN_CSS = `
    :host { display: inline-flex; margin-left: 8px; flex: none; }
    button {
      all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      height: var(--h, 36px); padding: 0 16px 0 10px; border-radius: calc(var(--h, 36px) / 2);
      font: 500 14px/1 Roboto, Arial, sans-serif; letter-spacing: normal; white-space: nowrap;
      color: var(--fg); background: var(--bg); transition: background .15s, box-shadow .2s;
      -webkit-tap-highlight-color: transparent;
    }
    button:hover { background: var(--bg-hover); }
    button:active { transform: scale(.97); }
    button:focus-visible { box-shadow: 0 0 0 2px var(--fg); }
    button[aria-expanded="true"] { background: var(--bg-hover); box-shadow: inset 0 0 0 1.5px #ffd60a; }
    svg { width: 24px; height: 24px; display: block; flex: none; }
  `;
  function styleButton(hostEl) {
    const dark = document.documentElement.hasAttribute('dark');
    const ref = document.querySelector('ytd-watch-metadata #top-level-buttons-computed yt-button-view-model button, ytd-watch-metadata #top-level-buttons-computed button');
    const hh = ref ? Math.round(parseFloat(getComputedStyle(ref).height)) || 36 : 36;
    hostEl.style.setProperty('--h', hh + 'px');
    hostEl.style.setProperty('--fg', dark ? '#f1f1f1' : '#0f0f0f');
    hostEl.style.setProperty('--bg', dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)');
    hostEl.style.setProperty('--bg-hover', dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)');
  }
  let btnHost = null, btn = null;
  function ensureButton() {
    if (!videoId()) return;
    const bar = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
    if (!bar) return;
    if (btnHost && bar.contains(btnHost)) return;
    btnHost = document.createElement('tde-clip-button');
    const root = btnHost.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + BTN_CSS + '</style>';
    btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Pobierz fragmenty do DaVinci Resolve (' + TC.keys.panel + ')';
    btn.setAttribute('aria-label', 'Pobierz do DaVinci');
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M7.5 4.5h-2a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h2M16.5 4.5h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-2"/><path d="M12 7.5v8.5M8.8 12.8L12 16l3.2-3.2"/></svg><span>DaVinci</span>';
    btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
    root.appendChild(btn);
    styleButton(btnHost);
    bar.appendChild(btnHost);
  }

  // ------------------------------------------------------------------ panel
  const PANEL_CSS = `
    :host { all: initial; }
    .tc-panel {
      position: fixed; top: var(--top, 68px); right: var(--right, 20px); z-index: 2147483000;
      width: 384px; max-height: calc(100vh - var(--top, 68px) - 16px); overflow-y: auto; overscroll-behavior: contain;
      border-radius: 16px; background: var(--tc-material);
      -webkit-backdrop-filter: blur(40px) saturate(180%); backdrop-filter: blur(40px) saturate(180%);
      box-shadow: var(--tc-shadow);
      transform-origin: var(--ox, 90%) var(--oy, 0%);
      animation: tcp-in .46s var(--tc-spring);
      scrollbar-width: thin;
    }
    .tc-panel::before { /* jasna krawędź materiału */
      content: ""; position: sticky; display: block; top: 0; height: 0; z-index: 2;
    }
    .tc-panel.tcp-closing { animation: tcp-out .2s cubic-bezier(.4,0,1,1) forwards; pointer-events: none; }
    @keyframes tcp-in { from { opacity: 0; transform: scale(.94); filter: blur(6px); } }
    @keyframes tcp-out { to { opacity: 0; transform: scale(.96); filter: blur(4px); } }
    .tc-head { cursor: grab; position: sticky; top: 0; z-index: 3; background: var(--tc-material); -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%); border-radius: 16px 16px 0 0; }
    .tc-head:active { cursor: grabbing; }
    .tc-panel.is-offline > :not(.tc-offline):not(.tc-head):not(.tc-divider) { display: none !important; }
    .tc-offline { display: none; }
    .tc-panel.is-offline .tc-offline { display: block; }
    .tc-panel .tc-jobs-wrap { padding-bottom: 6px; }
    .tc-brand { display: flex; align-items: center; gap: 6px; padding: 0 16px 10px; font-size: 11px; color: var(--tc-label-3); }
    .tc-brand img { width: 14px; height: 14px; border-radius: 4px; }
    .tc-panel::-webkit-scrollbar { width: 8px; }
    .tc-panel::-webkit-scrollbar-thumb { background: var(--tc-fill); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
    @media (prefers-reduced-transparency: reduce) { .tc-panel { background: var(--tc-material-solid); backdrop-filter: none; -webkit-backdrop-filter: none; } }
    @media (prefers-reduced-motion: reduce) { .tc-panel, .tc-panel.tcp-closing { animation-duration: .01ms; } }
  `;
  let panelHost = null, panel = null, sheet = null, isOpen = false, offlineEl = null;

  function buildPanel() {
    panelHost = document.createElement('tde-clip-panel');
    const root = panelHost.attachShadow({ mode: 'open' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = RT.getURL('ui/clip.css');
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    panel = h('div', { class: 'tc tc-panel', role: 'dialog', 'aria-label': 'TDE Clip – pobierz do DaVinci' });
    root.append(link, style, panel);
    (document.body || document.documentElement).appendChild(panelHost);
  }

  function placePanel() {
    const masthead = document.querySelector('#masthead-container');
    const top = masthead ? Math.max(12, masthead.getBoundingClientRect().bottom + 12) : 68;
    panel.style.setProperty('--top', (dragPos ? dragPos.top : top) + 'px');
    panel.style.setProperty('--right', (dragPos ? dragPos.right : 20) + 'px');
    // animacja „wyrasta” z przycisku
    if (btn) {
      const b = btn.getBoundingClientRect();
      const pr = innerWidth - (dragPos ? dragPos.right : 20), pl = pr - 384;
      const ox = Math.max(-200, Math.min(584, b.left + b.width / 2 - pl));
      const oy = Math.max(-200, b.top + b.height / 2 - (dragPos ? dragPos.top : top));
      panel.style.setProperty('--ox', ox + 'px');
      panel.style.setProperty('--oy', Math.min(oy, 1400) + 'px');
    }
  }
  let dragPos = null;
  function enableDrag(handle) {
    let s = null;
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button,input,select')) return;
      const r = panel.getBoundingClientRect();
      s = { x: e.clientX, y: e.clientY, top: r.top, right: innerWidth - r.right };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!s) return;
      const top = Math.max(8, Math.min(innerHeight - 120, s.top + e.clientY - s.y));
      const right = Math.max(8, Math.min(innerWidth - 392, s.right - (e.clientX - s.x)));
      dragPos = { top, right };
      panel.style.setProperty('--top', top + 'px');
      panel.style.setProperty('--right', right + 'px');
    });
    const end = () => { s = null; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function renderOffline() {
    const stale = lastFail && lastFail.stale;
    offlineEl.innerHTML = '';
    const retry = h('button', { class: 'tc-primary', type: 'button', onclick: async () => {
      if (stale) { location.reload(); return; }
      retry.disabled = true;
      const r = await send({ type: 'start' });
      lastFail = r.ok ? null : { host: r.error || 'no-host' };
      if (sheet) sheet.pollStatus();
      setTimeout(() => { retry.disabled = false; }, 1500);
    } }, stale ? 'Odśwież stronę' : 'Spróbuj ponownie');
    offlineEl.append(
      h('div', { class: 'tc-offline-top' }, [
        h('div', { class: 'tc-offline-icon', html: icon('boltSlash', 20, 1.6) }),
        h('div', null, [
          h('h3', null, stale ? 'Rozszerzenie zostało zaktualizowane' : 'TDE Clip nie jest uruchomiony'),
          h('div', { class: 'tc-offline-sub' }, stale ? 'Odśwież kartę, żeby znów działało.' : 'Silnik pobierania działa w tle na Twoim komputerze.')
        ])
      ]),
      stale ? null : h('ol', { html: '<li>W DaVinci wybierz <b>Workspace › Scripts › TDE Clip</b>.</li><li>Żeby uruchamiał się sam, otwórz raz <code>' + TC.keys.installer + '</code> z folderu tde-clip.</li>' }),
      retry,
      stale ? null : h('div', { class: 'tc-checking' }, [h('span', { class: 'tc-spinner' }), h('span', null, 'Sprawdzam automatycznie…')])
    );
  }

  function openPanel() {
    if (!videoId()) return;
    if (!panelHost || !panelHost.isConnected) buildPanel();
    if (sheet) { sheet.destroy(); sheet = null; }
    panel.innerHTML = '';
    panel.classList.remove('tcp-closing', 'is-offline');
    panel.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
    offlineEl = h('div', { class: 'tc-offline' });
    sheet = new TC.Sheet({
      api, player, video: currentVideo(), host: 'youtube', root: panel,
      onClose: closePanel,
      onOffline: () => { panel.classList.add('is-offline'); renderOffline(); },
      onOnline: () => { panel.classList.remove('is-offline'); lastFail = null; }
    });
    const head = panel.querySelector('.tc-head');
    head.after(offlineEl);
    enableDrag(head);
    panel.appendChild(h('div', { class: 'tc-brand', html: '<img alt="" src="' + RT.getURL('icons/icon-32.png') + '"><span>TDE Clip · ' + TC.keys.panel + ' otwiera i zamyka panel</span>' }));
    placePanel();
    panel.style.animation = 'none'; panel.offsetWidth; panel.style.animation = '';
    isOpen = true;
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    const s = sheet; sheet = null;
    panel.classList.add('tcp-closing');
    setTimeout(() => { if (!isOpen) { s && s.destroy(); panel.innerHTML = ''; panel.classList.remove('tcp-closing'); } }, 200);
  }
  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  // ------------------------------------------------------------------ klawiatura (przed skrótami YouTube)
  window.addEventListener('keydown', e => {
    if (!isOpen || !sheet) return;
    const t = e.composedPath()[0] || e.target;
    const inOurs = panelHost && e.composedPath().includes(panelHost);
    const typing = t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));
    if (typing && !inOurs) return; // pole wyszukiwania YouTube, komentarze
    const handled = sheet.handleKey({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, target: t });
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Escape' && !typing) { closePanel(); e.stopImmediatePropagation(); }
  }, true);

  // ------------------------------------------------------------------ nawigacja w YouTube (SPA)
  function onNavigate() {
    ensureButton();
    if (!isOpen || !sheet) return;
    const id = videoId();
    if (!id) closePanel();
    else if (id !== sheet.video.id) {
      sheet.setVideo(currentVideo());
    }
  }
  window.addEventListener('yt-navigate-finish', () => setTimeout(onNavigate, 300));
  window.addEventListener('popstate', () => setTimeout(onNavigate, 300));
  setInterval(() => {
    ensureButton();
    if (btnHost) styleButton(btnHost);
    if (isOpen && sheet) {
      // tytuł/kanał/długość potrafią dojść później niż URL
      const v = currentVideo();
      if (v.id === sheet.video.id && (!sheet.video.title || !sheet.video.duration) && (v.title || v.duration)) {
        sheet.video.title = sheet.video.title || v.title;
        sheet.video.channel = sheet.video.channel || v.channel;
        sheet.video.duration = sheet.video.duration || v.duration;
        if (sheet.headTitle) { sheet.headTitle.textContent = sheet.video.title; sheet.headSub.textContent = sheet._sub(); }
        sheet.updateSummary();
      }
      const dark = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
      if (panel.dataset.theme !== dark) panel.dataset.theme = dark;
    }
  }, 1200);
  ensureButton();

  RT.onMessage && RT.onMessage.addListener((msg, sender, reply) => {
    if (msg && msg.type === 'togglePanel') { togglePanel(); reply({ ok: true }); }
    if (msg && msg.type === 'openPanel') { if (!isOpen) openPanel(); reply({ ok: true }); }
    if (msg && msg.type === 'getVideo') reply(videoId() ? currentVideo() : null);
  });
  window.__tdeClip = { open: openPanel, close: closePanel, toggle: togglePanel, sheet: () => sheet };
})();
