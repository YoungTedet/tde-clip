(function () {
  const TC = window.TDEClip;
  const { icon, fmt } = TC;
  const $ = s => document.querySelector(s);
  document.body.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  $('#openApp').innerHTML = icon('search', 13) + '<span>Wyszukiwarka</span>';
  $('#openFolder').innerHTML = icon('folder', 13) + '<span>Folder</span>';
  $('#openPanel').innerHTML = icon('download', 13, 1.8) + '<span>Wybierz fragmenty</span>';

  const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || { ok: false }); }));
  const api = {
    get: async p => { const r = await send({ type: 'api', method: 'GET', path: p }); if (!r.ok) throw new Error(r.error); return r.data; },
    post: async (p, b) => { const r = await send({ type: 'api', method: 'POST', path: p, body: b }); if (!r.ok) throw new Error(r.error); return r.data; }
  };
  const list = new TC.JobList($('#jobs'), api, {});

  async function refresh() {
    try {
      const s = await api.get('/api/status');
      const r = s.resolve || {};
      $('#offline').hidden = true;
      $('#dot').className = 'tc-dot ' + (r.connected && r.project ? 'tc-on' : 'tc-warn');
      $('#status').textContent = r.connected && r.project ? r.project + (r.timeline ? ' › ' + r.timeline : '') : 'DaVinci zamknięty – pliki trafią do folderu';
      const d = await api.get('/api/jobs');
      const jobs = (d.jobs || []).slice(0, 5);
      $('#jobsSec').hidden = !jobs.length;
      list.update(jobs);
      setTimeout(refresh, jobs.some(j => TC.ACTIVE.has(j.status)) ? 800 : 2500);
    } catch (e) {
      $('#dot').className = 'tc-dot';
      $('#status').textContent = 'Silnik nie działa';
      const off = $('#offline');
      off.hidden = false;
      off.innerHTML = '<div class="tc-offline-top"><div class="tc-offline-icon">' + icon('boltSlash', 20, 1.6) + '</div><div><h3>TDE Clip nie jest uruchomiony</h3><div class="tc-offline-sub">Sprawdzam automatycznie…</div></div></div>' +
        '<ol><li>W DaVinci wybierz <b>Workspace › Scripts › TDE Clip</b>.</li><li>Żeby uruchamiał się sam, otwórz raz <code>' + TC.keys.installer + '</code>.</li></ol>';
      setTimeout(refresh, 2500);
    }
  }

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs && tabs[0];
    const m = tab && (tab.url || '').match(/youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{11})/);
    if (!m) { $('#hint').hidden = false; return; }
    $('#video').hidden = false;
    $('#vThumb').src = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg';
    $('#vTitle').textContent = (tab.title || '').replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
    $('#openPanel').addEventListener('click', () => { chrome.tabs.sendMessage(tab.id, { type: 'openPanel' }).catch(() => {}); window.close(); });
  });
  $('#openApp').addEventListener('click', () => { send({ type: 'openApp' }); window.close(); });
  $('#openFolder').addEventListener('click', () => api.post('/api/reveal', {}).catch(() => {}));
  refresh();
})();
