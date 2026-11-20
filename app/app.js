/* TDE Clip – okno w DaVinci: wyszukiwarka, podgląd, zaznaczanie fragmentów, pobrania. */
(function () {
  'use strict';
  const TC = window.TDEClip;
  const { h, icon, fmt } = TC;
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);

  // ------------------------------------------------------------------ środowisko
  const isElectron = /Electron/i.test(navigator.userAgent) || params.get('shell') === 'electron';
  document.body.classList.toggle('is-electron', isElectron);
  document.body.classList.toggle('is-win', params.get('os') === 'win' || /Windows/.test(navigator.userAgent));
  if (!TC.isMac) {
    // na Windows skróty z Ctrl zamiast ⌘
    document.querySelectorAll('.tc-kbd').forEach(k => { k.textContent = k.textContent.replace('⌘K', 'Ctrl K').replace('⌘↵', 'Ctrl ↵'); });
  }
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() { document.body.dataset.theme = params.get('theme') || (mq.matches ? 'dark' : 'light'); }
  applyTheme();
  mq.addEventListener && mq.addEventListener('change', applyTheme);
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, +(el.dataset.size || 16), +(el.dataset.sw || 1.6)); });
  $('#posterPlay').innerHTML = '<svg width="26" height="26" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.8v8.4c0 .5.5.8.9.5l6.6-4.2a.6.6 0 0 0 0-1L6.4 3.3c-.4-.3-.9 0-.9.5z" fill="currentColor"/></svg>';
  $('#back').innerHTML = icon('chevLeft', 16, 2);
  $('#openYt').innerHTML = 'Otwórz na YouTube ' + icon('external', 11, 1.7);
  $('#openYt2').textContent = 'Otwórz na YouTube';
  $('#dlFolder').innerHTML = icon('folder', 14) + '<span>Pokaż folder</span>';

  const store = {
    get(k, d) { try { const v = localStorage.getItem('tdeclip.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tdeclip.' + k, JSON.stringify(v)); } catch (e) { } }
  };

  // ------------------------------------------------------------------ API
  async function get(p) {
    const r = await fetch(p, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  }
  async function post(p, body) {
    const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TDE-Clip': '1' }, body: JSON.stringify(body || {}) });
    return r.json();
  }
  const api = { get, post };

  // ------------------------------------------------------------------ nawigacja
  const state = { view: 'search', prev: 'search', query: '', sort: 'relevance', results: [], video: null, sheet: null, player: null, jobs: [] };
  const views = { search: $('#view-search'), detail: $('#view-detail'), downloads: $('#view-downloads') };
  const order = { search: 0, downloads: 1, detail: 2 };

  function showView(name) {
    if (state.view === name) return;
    if (name === 'detail') state.prev = state.view;
    const from = state.view;
    state.view = name;
    Object.entries(views).forEach(([k, el]) => {
      const on = k === name;
      el.toggleAttribute('data-active', on);
      el.classList.toggle('is-behind', !on && order[k] < order[name]);
    });
    const navView = name === 'detail' ? state.prev : name;
    document.querySelectorAll('.sb-nav > .sb-item').forEach(b => b.setAttribute('aria-current', b.dataset.view === navView ? 'page' : 'false'));
    $('#back').hidden = name !== 'detail';
    $('#tbTitle').textContent = name === 'detail' ? (state.video && state.video.title || 'Film') : name === 'downloads' ? 'Pobrane' : 'Szukaj';
    if (from === 'detail' && name !== 'detail' && state.player) state.player.pause();
    updateToolbarShadow();
  }
  document.querySelectorAll('.sb-nav > .sb-item').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.view === 'search' && state.view === 'search') $('#q').focus();
    showView(b.dataset.view);
  }));
  $('#back').addEventListener('click', () => showView(state.prev === 'detail' ? 'search' : state.prev));

  function updateToolbarShadow() {
    const v = views[state.view];
    $('.toolbar').classList.toggle('is-scrolled', v.scrollTop > 2);
    // „Pobrane” ma duży nagłówek w treści – tytuł w pasku pojawia się dopiero po przewinięciu
    $('#tbTitle').classList.toggle('is-hidden', state.view === 'downloads' && v.scrollTop < 40);
  }
  Object.values(views).forEach(v => v.addEventListener('scroll', updateToolbarShadow, { passive: true }));

  // ------------------------------------------------------------------ szukanie
  const ytId = s => { const m = (s || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; };
  const sortSeg = TC.Segmented({ label: 'Sortowanie', size: 'sm', value: 'relevance', options: [{ value: 'relevance', label: 'Trafność' }, { value: 'date', label: 'Najnowsze' }],
    onChange: v => { state.sort = v; if (state.query) runSearch(state.query); } });
  $('#sortMount').appendChild(sortSeg.el);

  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); const q = $('#q').value.trim(); if (q) runSearch(q); });
  $('#q').addEventListener('paste', () => setTimeout(() => { const q = $('#q').value.trim(); if (ytId(q)) runSearch(q); }, 0));

  let searchSeq = 0;
  async function runSearch(q) {
    const id = ytId(q);
    if (id && !/list=/.test(q)) {
      openVideo({ id, url: 'https://www.youtube.com/watch?v=' + id, title: '', channel: '', thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' });
      $('#q').blur();
      return;
    }
    state.query = q;
    remember(q);
    showView('search');
    $('#emptyState').hidden = true;
    $('#results').hidden = false;
    $('#rhTitle').innerHTML = 'Szukam „<strong></strong>”…';
    $('#rhTitle strong').textContent = q;
    renderSkeleton();
    const seq = ++searchSeq;
    try {
      const d = await get('/api/search?q=' + encodeURIComponent(q) + '&sort=' + state.sort);
      if (seq !== searchSeq) return;
      state.results = d.results || [];
      const n = state.results.length;
      $('#rhTitle').innerHTML = (d.kind === 'playlist' ? 'Playlista „<strong></strong>”' : 'Wyniki dla „<strong></strong>”') + ' · ' + n;
      $('#rhTitle strong').textContent = d.kind === 'playlist' ? (d.title || q) : q;
      renderResults();
    } catch (e) {
      if (seq !== searchSeq) return;
      $('#rhTitle').textContent = '';
      $('#grid').innerHTML = '';
      $('#grid').appendChild(h('div', { class: 'err-box', style: { gridColumn: '1 / -1' } }, [
        h('h3', null, 'Nie udało się wyszukać'), h('p', null, e.message),
        h('button', { class: 'tc-btn', type: 'button', onclick: () => runSearch(q) }, 'Spróbuj ponownie')]));
    }
  }
  function renderSkeleton() {
    const g = $('#grid'); g.innerHTML = '';
    for (let i = 0; i < 12; i++) g.appendChild(h('div', { class: 'card sk', 'aria-hidden': 'true' }, [h('div', { class: 'card-thumb' }), h('div', { class: 'sk-line' }), h('div', { class: 'sk-line short' })]));
  }
  function renderResults() {
    const g = $('#grid'); g.innerHTML = '';
    if (!state.results.length) {
      g.appendChild(h('div', { class: 'err-box', style: { gridColumn: '1 / -1' } }, [h('h3', null, 'Brak wyników'), h('p', null, 'Spróbuj innych słów albo wklej link do filmu.')]));
      return;
    }
    state.results.forEach((r, i) => {
      const img = h('img', { alt: '', loading: i < 12 ? 'eager' : 'lazy', referrerpolicy: 'no-referrer', src: r.thumb });
      img.addEventListener('load', () => img.classList.add('is-loaded'));
      const meta = [r.channel, r.views != null ? fmt.count(r.views) + ' wyświetleń' : ''].filter(Boolean).join(' · ');
      const card = h('button', { class: 'card', type: 'button', title: r.title, onclick: () => openVideo(r) }, [
        h('div', { class: 'card-thumb' }, [img, r.live ? h('span', { class: 'card-dur is-live' }, 'NA ŻYWO') : (r.duration ? h('span', { class: 'card-dur' }, fmt.time(r.duration)) : null)]),
        h('div', { class: 'card-title' }, r.title),
        h('div', { class: 'card-meta' }, meta)
      ]);
      card.style.animation = 'tc-row-in .5s var(--tc-spring) ' + Math.min(i, 12) * 22 + 'ms both';
      g.appendChild(card);
    });
  }

  function remember(q) {
    let list = store.get('recent', []).filter(x => x.toLowerCase() !== q.toLowerCase());
    list.unshift(q);
    list = list.slice(0, 6);
    store.set('recent', list);
    renderRecent();
  }
  function renderRecent() {
    const list = store.get('recent', []);
    $('#recentHeading').hidden = !list.length;
    const box = $('#recent'); box.innerHTML = '';
    list.forEach(q => box.appendChild(h('button', { class: 'sb-item', type: 'button', title: q, onclick: () => { $('#q').value = q; runSearch(q); } }, [
      h('span', { class: 'sb-ic', html: icon('clock', 14) }), h('span', { class: 'sb-label' }, q)])));
  }
  renderRecent();

  // ------------------------------------------------------------------ odtwarzacz (YouTube IFrame API)
  let ytReady = null;
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise(res => {
      if (window.YT && window.YT.Player) return res(window.YT);
      window.onYouTubeIframeAPIReady = () => res(window.YT);
      document.head.appendChild(h('script', { src: 'https://www.youtube.com/iframe_api' }));
    });
    return ytReady;
  }
  function hidePoster() { $('#poster').classList.add('is-gone'); }
  $('#poster').addEventListener('click', () => { if (state.player) state.player.play(); });
  function makePlayer(host, videoId, onFail) {
    let p = null, ready = false, failed = false, virtual = 0;
    const live = () => ready && !failed && p;
    const ad = {
      getTime: () => live() && p.getCurrentTime ? (p.getCurrentTime() || 0) : virtual,
      getDuration: () => live() && p.getDuration ? (p.getDuration() || 0) : 0,
      seek(t) {
        virtual = t;
        hidePoster();
        if (!live()) return;
        const playing = p.getPlayerState() === 1;
        p.seekTo(t, true);
        if (!playing) p.pauseVideo();
      },
      play() { hidePoster(); if (live()) p.playVideo(); },
      pause() { if (live()) p.pauseVideo(); },
      isPlaying: () => !!(live() && p.getPlayerState && p.getPlayerState() === 1),
      destroy() { try { p && p.destroy(); } catch (e) { } }
    };
    loadYT().then(YT => {
      const el = h('div');
      host.innerHTML = '';
      host.appendChild(el);
      p = new YT.Player(el, {
        videoId, width: '100%', height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => { ready = true; },
          onError: e => { if ([2, 5, 100, 101, 150, 153].includes(e.data)) { failed = true; onFail && onFail(e.data); } }
        }
      });
    });
    return ad;
  }

  // ------------------------------------------------------------------ widok filmu
  function openVideo(v) {
    const vid = v.id || ytId(v.url);
    if (!vid) return;
    if (state.sheet) state.sheet.destroy();
    if (state.player) state.player.destroy();
    $('#momentsMount').innerHTML = '';
    $('#optionsMount').innerHTML = '';
    $('#playerFallback').hidden = true;
    state.video = { id: vid, url: 'https://www.youtube.com/watch?v=' + vid, title: v.title || '', channel: v.channel || '', duration: v.duration || 0, thumb: v.thumb || 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg', views: v.views };
    setDetailMeta(state.video, null);
    $('#desc').textContent = '';
    const host = $('#player');
    const poster = $('#poster');
    poster.classList.remove('is-gone');
    $('#posterImg').src = 'https://i.ytimg.com/vi/' + vid + '/maxresdefault.jpg';
    $('#posterImg').onerror = function () { this.onerror = null; this.src = state.video.thumb; };
    state.player = makePlayer(host, vid, () => {
      $('#fallbackImg').src = state.video.thumb;
      $('#playerFallback').hidden = false;
    });
    state.sheet = new TC.Sheet({
      api, player: state.player, video: state.video, host: 'app',
      mounts: { moments: $('#momentsMount'), options: $('#optionsMount') },
      onInfo: info => {
        if (!info) return;
        Object.assign(state.video, { title: state.video.title || info.title, channel: state.video.channel || info.channel, duration: info.duration, views: info.views, date: info.date });
        setDetailMeta(state.video, info);
        $('#desc').textContent = info.description || '';
        if (state.view === 'detail') $('#tbTitle').textContent = state.video.title;
      }
    });
    views.detail.scrollTop = 0;
    showView('detail');
    $('#tbTitle').textContent = state.video.title || 'Film';
  }
  function setDetailMeta(v, info) {
    const bits = [v.channel, v.views != null ? fmt.count(v.views) + ' wyświetleń' : '', info && info.date ? fmt.ago(info.date) : ''].filter(Boolean);
    $('#dMeta').textContent = bits.join(' · ') || 'Wczytuję…';
  }
  const openYt = () => state.video && post('/api/open', { url: state.video.url });
  $('#openYt').addEventListener('click', openYt);
  $('#openYt2').addEventListener('click', openYt);

  // ------------------------------------------------------------------ pobrane + status
  const dlList = new TC.JobList($('#dlList'), api, { onChange: () => pollJobs(true) });
  $('#dlList').addEventListener('click', e => {
    if (e.target.closest('button')) return;
    const rowEl = e.target.closest('.tc-job');
    if (!rowEl) return;
    const idx = Array.prototype.indexOf.call($('#dlList').children, rowEl);
    const j = state.jobs[idx];
    if (j && j.vid) openVideo({ id: j.vid, title: j.title, channel: j.channel, thumb: j.thumb, duration: j.duration });
  });
  $('#dlClear').addEventListener('click', () => post('/api/clear').then(() => pollJobs(true)));
  $('#dlFolder').addEventListener('click', () => post('/api/reveal', {}));

  let jobsTimer = 0;
  async function pollJobs(now) {
    clearTimeout(jobsTimer);
    let active = 0;
    try {
      const d = await get('/api/jobs');
      state.jobs = d.jobs || [];
      active = state.jobs.filter(j => TC.ACTIVE.has(j.status)).length;
      dlList.update(state.jobs);
      $('#dlEmpty').hidden = state.jobs.length > 0;
      const done = state.jobs.filter(j => j.status === 'done').length;
      $('#dlSub').textContent = state.jobs.length
        ? [active ? active + ' w toku' : '', done ? done + ' ' + fmt.plural(done, 'gotowe', 'gotowe', 'gotowych') + ' w DaVinci' : ''].filter(Boolean).join(' · ') || 'Wszystko, co wysłałeś do DaVinci – z Chrome i z tego okna.'
        : 'Wszystko, co wysłałeś do DaVinci – z Chrome i z tego okna.';
      const badge = $('.sb-badge');
      badge.hidden = !active;
      badge.textContent = active;
      badge.classList.toggle('is-active', !!active);
      $('#dlClear').hidden = !state.jobs.some(j => !TC.ACTIVE.has(j.status));
    } catch (e) { }
    jobsTimer = setTimeout(pollJobs, active ? 800 : 3000);
  }

  let offline = false;
  async function pollStatus() {
    try {
      const s = await get('/api/status');
      state.status = s;
      if (offline) { offline = false; $('#offline').hidden = true; }
      const r = s.resolve || {};
      const dot = $('#resolveDot');
      if (r.connected && r.project) {
        dot.className = 'tc-dot tc-on';
        $('#resolveTitle').textContent = r.project;
        $('#resolveSub').textContent = r.timeline ? r.timeline + (r.fps ? ' · ' + String(r.fps).replace('.', ',') + ' kl./s' : '') : 'Brak otwartej timeline';
      } else if (r.connected) {
        dot.className = 'tc-dot tc-warn';
        $('#resolveTitle').textContent = 'DaVinci Resolve';
        $('#resolveSub').textContent = 'Otwórz projekt, aby importować';
      } else {
        dot.className = 'tc-dot tc-warn';
        $('#resolveTitle').textContent = 'DaVinci Resolve';
        $('#resolveSub').textContent = 'Nie połączono – pliki trafią do folderu';
      }
    } catch (e) {
      if (!offline) { offline = true; $('#offline').hidden = false; }
      $('#resolveDot').className = 'tc-dot';
      $('#resolveSub').textContent = 'Silnik nie odpowiada';
    }
    setTimeout(pollStatus, offline ? 2000 : 3500);
  }

  // ------------------------------------------------------------------ ustawienia
  const modal = $('#settings');
  let setCtl = null;
  async function openSettings() {
    let s = {};
    try { s = await get('/api/settings'); } catch (e) { }
    const st = state.status || {};
    const g = $('#setGroup'); g.innerHTML = '';
    const home = (s.folder || '').replace(/^\/Users\/[^/]+/, '~');
    const pathEl = h('span', { class: 'folder-path', title: s.folder || '' }, [h('span', { html: icon('folder', 13), style: { direction: 'ltr' } }), h('span', null, home)]);
    const folder = h('div', { class: 'folder-ctl' }, [pathEl, h('button', { class: 'tc-btn', type: 'button', onclick: async () => {
      const r = await post('/api/choose-folder', {}).catch(() => null);
      if (r && r.folder) { pathEl.lastChild.textContent = r.folder.replace(/^\/Users\/[^/]+/, '~'); pathEl.title = r.folder; }
    } }, 'Zmień…')]);
    const cookies = TC.Popup({ label: 'Ciasteczka', value: s.cookies || '', options: [
      { value: '', label: 'Nie używaj' }, { value: 'chrome', label: 'Chrome' }, { value: 'safari', label: 'Safari' },
      { value: 'firefox', label: 'Firefox' }, { value: 'brave', label: 'Brave' }, { value: 'edge', label: 'Edge' }] });
    const results = TC.Popup({ label: 'Wyniki', value: String(s.results || 24), options: [{ value: '12', label: '12' }, { value: '24', label: '24' }, { value: '48', label: '48' }] });
    const mk = (label, ctl, sub) => h('div', { class: 'tc-row' }, [h('div', { class: 'tc-row-label' }, [h('span', null, label), sub ? h('small', null, sub) : null]), ctl]);
    const ok = v => '<span class="' + (v ? 'ok' : 'bad') + '">' + icon(v ? 'check' : 'xmark', 12, 2) + '</span>';
    g.append(
      mk('Folder pobrań', folder, 'Każdy film dostaje własny podfolder'),
      mk('Ciasteczka z przeglądarki', cookies.el, 'Dla filmów 18+ i komunikatu „nie jesteś botem”'),
      mk('Wyniki wyszukiwania', results.el),
      mk('Silnik', h('span', { class: 'ok-pill', html: ok(st.ytdlp) + 'yt-dlp&nbsp;&nbsp;' + ok(st.ffmpeg) + 'ffmpeg' }))
    );
    $('#setNote').innerHTML = 'W DaVinci każdy film ląduje w nowym binie wewnątrz <b>TDE Clip</b>. Gdy YouTube zacznie odmawiać pobierania, wpisz w ' + (TC.isMac ? 'Terminalu' : 'wierszu poleceń') + ' <code>' + (st.updateHint || 'brew upgrade yt-dlp') + '</code>.';
    setCtl = { folder, cookies, results };
    modal.hidden = false;
    modal.classList.remove('is-closing');
  }
  function closeSettings() {
    if (modal.hidden || modal.classList.contains('is-closing')) return;
    modal.classList.add('is-closing');
    setTimeout(() => { modal.hidden = true; modal.classList.remove('is-closing'); }, 230);
  }
  $('#openSettings').addEventListener('click', openSettings);
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSettings(); });
  $('#setSave').addEventListener('click', async () => {
    if (setCtl) await post('/api/settings', { cookies: setCtl.cookies.get(), results: +setCtl.results.get() }).catch(() => { });
    closeSettings();
  });

  // ------------------------------------------------------------------ klawiatura
  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'k' || e.key === 'f')) { e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
    if (mod && e.key === '1') { e.preventDefault(); showView('search'); return; }
    if (mod && e.key === '2') { e.preventDefault(); showView('downloads'); return; }
    if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
    if (e.key === 'Escape') {
      if (!modal.hidden) { closeSettings(); return; }
      if (state.view === 'detail' && state.sheet && state.sheet.draft != null && state.sheet.handleKey(e)) { e.preventDefault(); return; }
      if (document.activeElement && document.activeElement.matches('input')) { document.activeElement.blur(); return; }
      if (state.view === 'detail') { showView(state.prev === 'detail' ? 'search' : state.prev); return; }
    }
    if (state.view === 'detail' && state.sheet && modal.hidden) {
      if (state.sheet.handleKey(e)) { e.preventDefault(); return; }
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
      if (!typing && e.key === ' ') { e.preventDefault(); state.player.isPlaying() ? state.player.pause() : state.player.play(); }
    }
  });

  // ------------------------------------------------------------------ start
  pollStatus();
  pollJobs();
  if (params.get('view') === 'downloads') showView('downloads');
  if (params.get('q')) { $('#q').value = params.get('q'); runSearch(params.get('q')); }
  else if (params.get('v')) {
    runSearch('https://www.youtube.com/watch?v=' + params.get('v'));
    (params.get('ranges') || '').split(',').filter(Boolean).forEach(r => { const [a, b] = r.split('-').map(parseFloat); state.sheet && state.sheet.addRange(a, b); });
    if (params.get('more') && state.sheet) state.sheet.toggle(state.sheet.moreBtn, state.sheet.moreWrap);
  }
  else if (params.get('view') !== 'downloads' && !params.get('settings')) setTimeout(() => $('#q').focus(), 120);
  if (params.get('settings')) setTimeout(openSettings, 300);
})();
