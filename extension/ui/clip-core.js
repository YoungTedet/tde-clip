/* TDE Clip – wspólny rdzeń interfejsu (panel w Chrome + okno w DaVinci).
   Bez zależności. Eksportuje window.TDEClip. */
(function (global) {
  'use strict';
  const TC = (global.TDEClip = global.TDEClip || {});
  // skróty i nazwy zależne od systemu (macOS / Windows)
  const nav = global.navigator || {};
  const IS_MAC = /mac|iphone|ipad/i.test((nav.userAgentData && nav.userAgentData.platform) || nav.platform || nav.userAgent || '');
  TC.isMac = IS_MAC;
  TC.keys = IS_MAC
    ? { search: '⌘K', submit: '⌘↩', panel: '⌥D', installer: 'Zainstaluj.command' }
    : { search: 'Ctrl+K', submit: 'Ctrl+Enter', panel: 'Alt+D', installer: 'Zainstaluj.bat' };

  // ------------------------------------------------------------------ ikony (styl SF Symbols)
  const P = {
    xmark: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
    plus: '<path d="M8 3.5v9M3.5 8h9"/>',
    play: '<path d="M5.5 3.8v8.4c0 .5.5.8.9.5l6.6-4.2a.6.6 0 0 0 0-1L6.4 3.3c-.4-.3-.9 0-.9.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="4.5" y="3.5" width="2.4" height="9" rx=".8" fill="currentColor" stroke="none"/><rect x="9.1" y="3.5" width="2.4" height="9" rx=".8" fill="currentColor" stroke="none"/>',
    check: '<path d="M3.8 8.4l2.8 2.8 5.6-6.4"/>',
    checkCircle: '<circle cx="8" cy="8" r="7" fill="currentColor" stroke="none"/><path d="M5 8.2l2 2 4-4.4" stroke="#fff" stroke-width="1.7"/>',
    warnCircle: '<circle cx="8" cy="8" r="7" fill="currentColor" stroke="none"/><path d="M8 4.6v4.2" stroke="#fff" stroke-width="1.7"/><circle cx="8" cy="11.2" r=".95" fill="#fff" stroke="none"/>',
    download: '<path d="M8 2.5v8M4.6 7.3L8 10.7l3.4-3.4M3 13.5h10"/>',
    downloadCircle: '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.8v5.6M5.6 8.2L8 10.6l2.4-2.4"/>',
    retry: '<path d="M12.9 8.3A4.9 4.9 0 1 1 11.5 4.6"/><path d="M12.2 2.4v2.8H9.4"/>',
    folder: '<path d="M2.2 4.6c0-.6.5-1.1 1.1-1.1h2.9l1.5 1.5h5c.6 0 1.1.5 1.1 1.1v5.6c0 .6-.5 1.1-1.1 1.1H3.3c-.6 0-1.1-.5-1.1-1.1z"/>',
    chevRight: '<path d="M6.2 3.6L10.6 8l-4.4 4.4"/>',
    chevLeft: '<path d="M9.8 3.6L5.4 8l4.4 4.4"/>',
    updown: '<path d="M5.2 6.2L8 3.4l2.8 2.8M5.2 9.8L8 12.6l2.8-2.8"/>',
    markIn: '<path d="M5.8 3.2H3.6v9.6h2.2"/><path d="M7 8h6M10.6 5.6L13 8l-2.4 2.4"/>',
    markOut: '<path d="M10.2 3.2h2.2v9.6h-2.2"/><path d="M9 8H3M5.4 5.6L3 8l2.4 2.4"/>',
    search: '<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4l3.6 3.6"/>',
    sliders: '<path d="M2.5 5h6.2M12.3 5h1.2M2.5 11h1.2M7.3 11h6.2"/><circle cx="10.5" cy="5" r="1.8"/><circle cx="5.5" cy="11" r="1.8"/>',
    film: '<rect x="2.3" y="3.3" width="11.4" height="9.4" rx="1.6"/><path d="M5.2 3.3v9.4M10.8 3.3v9.4M2.3 6.4h2.9M2.3 9.6h2.9M10.8 6.4h2.9M10.8 9.6h2.9"/>',
    wave: '<path d="M2.5 8h.6M5 5.6v4.8M7.5 3v10M10 5v6M12.5 6.8v2.4"/>',
    timeline: '<rect x="2.3" y="3.2" width="7" height="3.6" rx="1"/><rect x="5.8" y="9.2" width="7.9" height="3.6" rx="1"/>',
    clock: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.3 1.6"/>',
    link: '<path d="M7 9a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.8.8"/><path d="M9 7a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.8-.8"/>',
    external: '<path d="M9.5 2.8h3.7v3.7M13.2 2.8L7.6 8.4"/><path d="M11.5 9.6v2.6c0 .6-.5 1.1-1.1 1.1H3.9c-.6 0-1.1-.5-1.1-1.1V5.7c0-.6.5-1.1 1.1-1.1h2.6"/>',
    resolve: '<circle cx="8" cy="5.2" r="2.5"/><circle cx="5" cy="10.4" r="2.5"/><circle cx="11" cy="10.4" r="2.5"/>',
    sparkle: '<path d="M8 2.5l1.3 3.7L13 7.5l-3.7 1.3L8 12.5l-1.3-3.7L3 7.5l3.7-1.3z"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1.6" fill="currentColor" stroke="none"/>',
    boltSlash: '<path d="M9.2 2.2L4.6 8.8h3.2l-.9 5 2.2-3.1M10.6 8.7h1.1L9.9 11.3M2.5 2.5l11 11"/>'
  };
  function icon(name, size, sw) {
    size = size || 14;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="' +
      (sw || 1.6) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }
  TC.icon = icon;

  // ------------------------------------------------------------------ formatowanie (po polsku)
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(sec, tenths) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    let t = tenths ? Math.round(sec * 10) / 10 : Math.floor(sec + 1e-6);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
    let s = t - h * 3600 - m * 60;
    let ss = tenths ? s.toFixed(1).padStart(4, '0').replace('.', ',') : pad(Math.floor(s));
    return h ? h + ':' + pad(m) + ':' + ss : m + ':' + ss;
  }
  function parseTime(str) {
    if (str == null) return NaN;
    str = String(str).trim().replace(',', '.');
    if (!str) return NaN;
    if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
    const hms = str.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i);
    if (hms && (hms[1] || hms[2] || hms[3])) return (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
    const parts = str.split(':');
    if (parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return NaN;
    return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
  }
  function fmtLen(sec) {
    if (!isFinite(sec)) return '';
    if (sec < 60) return (Math.round(sec * 10) / 10).toString().replace('.', ',') + ' s';
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    if (m < 60) return m + ' min' + (s ? ' ' + s + ' s' : '');
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  function fmtBytes(n) {
    if (!n || n < 0) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    const v = n >= 100 || i < 2 ? Math.round(n) : Math.round(n * 10) / 10;
    return String(v).replace('.', ',') + ' ' + u[i];
  }
  function fmtCount(n) {
    if (n == null) return '';
    if (n >= 1e9) return String(Math.round(n / 1e8) / 10).replace('.', ',') + ' mld';
    if (n >= 1e6) return String(Math.round(n / 1e5) / 10).replace('.', ',') + ' mln';
    if (n >= 1e3) return Math.round(n / 1e3) + ' tys.';
    return String(n);
  }
  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, dd = n % 100;
    return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
  }
  function fmtAgo(yyyymmdd) {
    if (!yyyymmdd || yyyymmdd.length !== 8) return '';
    const d = new Date(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8));
    const days = Math.floor((Date.now() - d.getTime()) / 864e5);
    if (days < 1) return 'dzisiaj';
    if (days < 2) return 'wczoraj';
    if (days < 31) return days + ' ' + plural(days, 'dzień', 'dni', 'dni') + ' temu';
    const mo = Math.floor(days / 30.4);
    if (mo < 12) return mo + ' ' + plural(mo, 'miesiąc', 'miesiące', 'miesięcy') + ' temu';
    const y = Math.floor(days / 365.25);
    return y + ' ' + plural(y, 'rok', 'lata', 'lat') + ' temu';
  }
  TC.fmt = { time: fmtTime, parse: parseTime, len: fmtLen, bytes: fmtBytes, count: fmtCount, plural, ago: fmtAgo };

  // ------------------------------------------------------------------ DOM
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(c => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  TC.h = h;

  // ------------------------------------------------------------------ kontrolki
  function Segmented(o) {
    const thumb = h('span', { class: 'tc-seg-thumb' });
    const root = h('div', { class: 'tc-seg' + (o.size ? ' tc-seg-' + o.size : ''), role: 'radiogroup', 'aria-label': o.label || '' }, [thumb]);
    let value = o.value;
    const buttons = o.options.map(opt => {
      const b = h('button', { type: 'button', role: 'radio', title: opt.title || null, html: (opt.icon ? icon(opt.icon, 13) : '') + '<span>' + opt.label + '</span>' });
      b.dataset.value = opt.value;
      b.addEventListener('click', () => { if (String(value) !== String(opt.value)) { set(opt.value); o.onChange && o.onChange(opt.value); } });
      root.appendChild(b);
      return b;
    });
    let ready = false;
    function place(animate) {
      const b = buttons.find(x => x.dataset.value === String(value));
      if (!b || !b.offsetWidth) return;
      if (!animate) thumb.style.transition = 'none';
      thumb.style.width = b.offsetWidth + 'px';
      thumb.style.transform = 'translateX(' + (b.offsetLeft - 2) + 'px)';
      if (!animate) { thumb.offsetWidth; thumb.style.transition = ''; }
    }
    function set(v) {
      value = v;
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
      place(ready);
    }
    set(value);
    if (global.ResizeObserver) new ResizeObserver(() => { place(false); ready = true; }).observe(root);
    else setTimeout(() => { place(false); ready = true; }, 50);
    return { el: root, set, get: () => value };
  }

  function Popup(o) {
    const sel = h('select', { 'aria-label': o.label || '' });
    const wrap = h('label', { class: 'tc-popup' }, [sel, h('span', { class: 'tc-updown', html: icon('updown', 10, 1.8) })]);
    function setOptions(opts, value) {
      sel.innerHTML = '';
      opts.forEach(op => sel.appendChild(h('option', { value: op.value, disabled: op.disabled || null }, op.label)));
      if (value != null) sel.value = String(value);
    }
    setOptions(o.options, o.value);
    sel.addEventListener('change', () => o.onChange && o.onChange(sel.value));
    return { el: wrap, set: v => { sel.value = String(v); }, get: () => sel.value, setOptions, select: sel };
  }

  function Switch(o) {
    const b = h('button', { class: 'tc-switch', type: 'button', role: 'switch', 'aria-checked': String(!!o.value), 'aria-label': o.label || '' });
    b.addEventListener('click', () => {
      const v = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(v));
      o.onChange && o.onChange(v);
    });
    return { el: b, set: v => b.setAttribute('aria-checked', String(!!v)) };
  }
  TC.Segmented = Segmented; TC.Popup = Popup; TC.Switch = Switch;

  function row(label, control, sub) {
    return h('div', { class: 'tc-row' }, [
      h('div', { class: 'tc-row-label' }, [h('span', null, label), sub ? h('small', null, sub) : null]),
      control
    ]);
  }

  // ------------------------------------------------------------------ pasek z klatkami + zakresy
  class RangeBar {
    constructor(sheet) {
      this.sheet = sheet;
      this.el = h('div', { class: 'tc-bar', tabindex: '0', role: 'slider', 'aria-label': 'Oś filmu – przeciągnij, aby zaznaczyć fragment' });
      this.film = h('div', { class: 'tc-bar-film' }, [h('div', { class: 'tc-bar-shimmer' })]);
      this.layer = h('div', { style: { position: 'absolute', inset: '0' } });
      this.skim = h('div', { class: 'tc-bar-skim' });
      this.playhead = h('div', { class: 'tc-bar-playhead' });
      this.tip = h('div', { class: 'tc-bar-tip' });
      this.el.append(this.film, this.layer, this.skim, this.playhead, this.tip);
      this.frames = [];
      this.sb = null;
      this.width = 0;
      this.lastSeek = 0;
      this._bind();
      if (global.ResizeObserver) new ResizeObserver(() => this._resize()).observe(this.el);
    }
    get dur() { return this.sheet.duration() || 0; }
    x2t(x) { const w = this.el.clientWidth || 1; return Math.max(0, Math.min(this.dur, (x / w) * this.dur)); }
    t2p(t) { return this.dur ? Math.max(0, Math.min(100, (t / this.dur) * 100)) : 0; }
    _resize() {
      const w = this.el.clientWidth;
      if (Math.abs(w - this.width) < 4) return;
      this.width = w;
      this.renderFilm();
    }
    setStoryboard(sb) { this.sb = sb; this.renderFilm(); }
    renderFilm() {
      const sb = this.sb, dur = this.dur, w = this.el.clientWidth;
      if (!w) return;
      const hgt = this.el.clientHeight || 46;
      const n = Math.max(3, Math.round(w / (hgt * 16 / 9)));
      this.film.innerHTML = '';
      if (!sb || !dur || !sb.sheets || !sb.sheets.length) {
        this.film.appendChild(h('div', { class: 'tc-bar-shimmer', style: sb === false ? { animation: 'none', opacity: '0' } : null }));
        return;
      }
      const per = sb.rows * sb.columns;
      const fps = sb.fps || (per / (sb.sheets[0].duration || 1));
      const used = {};
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n) * dur;
        let acc = 0, si = 0;
        while (si < sb.sheets.length - 1 && t >= acc + (sb.sheets[si].duration || 0)) { acc += sb.sheets[si].duration || 0; si++; }
        let local = Math.floor((t - acc) * fps);
        local = Math.max(0, Math.min(per - 1, local));
        const col = local % sb.columns, rowi = Math.floor(local / sb.columns);
        const f = h('div', { class: 'tc-bar-frame' });
        const url = sb.sheets[si].url;
        f.style.backgroundImage = 'url("' + url + '")';
        f.style.backgroundSize = (sb.columns * 100) + '% ' + (sb.rows * 100) + '%';
        f.style.backgroundPosition = (sb.columns > 1 ? (col / (sb.columns - 1)) * 100 : 0) + '% ' + (sb.rows > 1 ? (rowi / (sb.rows - 1)) * 100 : 0) + '%';
        (used[url] = used[url] || []).push(f);
        this.film.appendChild(f);
      }
      Object.keys(used).forEach(url => {
        const img = new Image();
        img.onload = () => used[url].forEach((f, k) => setTimeout(() => f.classList.add('tc-loaded'), k * 30));
        img.onerror = () => used[url].forEach(f => f.classList.add('tc-loaded'));
        img.referrerPolicy = 'no-referrer';
        img.src = url;
      });
      this.renderChapters();
    }
    renderChapters() {
      this.film.querySelectorAll('.tc-bar-chapter').forEach(e => e.remove());
      const ch = this.sheet.chapters || [];
      ch.forEach((c, i) => { if (i > 0) this.film.appendChild(h('div', { class: 'tc-bar-chapter', style: { left: this.t2p(c.start) + '%' } })); });
    }
    render() {
      const s = this.sheet;
      this.layer.innerHTML = '';
      const sorted = s.sortedRanges();
      sorted.forEach((r, idx) => {
        const wpx = (this.t2p(r.end) - this.t2p(r.start)) / 100 * (this.el.clientWidth || 300);
        const el = h('div', { class: 'tc-bar-range' + (r === s.active ? ' tc-active' : ''), style: { left: this.t2p(r.start) + '%', width: Math.max(0.6, this.t2p(r.end) - this.t2p(r.start)) + '%' } }, [
          wpx >= 34 ? h('span', { class: 'tc-bar-num' }, String(idx + 1)) : null,
          h('div', { class: 'tc-bar-handle tc-in', 'data-edge': 'in' }),
          h('div', { class: 'tc-bar-handle tc-out', 'data-edge': 'out' })
        ]);
        el._range = r;
        this.layer.appendChild(el);
      });
      if (s.draft != null) {
        const now = s.player.getTime();
        const a = Math.min(s.draft, now), b = Math.max(s.draft, now);
        this.layer.appendChild(h('div', { class: 'tc-bar-range tc-draft', style: { left: this.t2p(a) + '%', width: Math.max(0.4, this.t2p(b) - this.t2p(a)) + '%' } }));
      }
    }
    tick(t) {
      this.playhead.style.left = this.t2p(t) + '%';
      if (this.sheet.draft != null) this.render();
    }
    _tip(x, t, extra) {
      const w = this.el.clientWidth;
      this.tip.style.left = Math.max(24, Math.min(w - 24, x)) + 'px';
      this.tip.innerHTML = fmtTime(t, true) + (extra ? '<small>' + extra + '</small>' : '');
    }
    _seek(t, force) {
      const now = performance.now();
      if (force || now - this.lastSeek > 90) { this.lastSeek = now; this.sheet.player.seek(t); }
    }
    _bind() {
      const el = this.el;
      let drag = null;
      el.addEventListener('pointermove', e => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const t = this.x2t(x);
        this.skim.style.left = x + 'px';
        if (!drag) { this._tip(x, t); return; }
        const dx = Math.abs(e.clientX - drag.x0);
        if (drag.mode === 'pending' && dx > 3) {
          drag.mode = 'create';
          drag.range = this.sheet.addRange(Math.min(drag.t0, t), Math.max(drag.t0, t) + 0.01, true);
          el.classList.add('tc-dragging');
        }
        const r = drag.range;
        if (drag.mode === 'create') {
          r.start = Math.min(drag.t0, t); r.end = Math.max(drag.t0, t);
          this._seek(t);
          this._tip(x, t, fmtLen(r.end - r.start));
        } else if (drag.mode === 'in') {
          r.start = Math.min(t, r.end - 0.2);
          this._seek(r.start); this._tip(x, r.start, 'początek');
        } else if (drag.mode === 'out') {
          r.end = Math.max(t, r.start + 0.2);
          this._seek(r.end); this._tip(x, r.end, 'koniec');
        } else if (drag.mode === 'move' && dx > 2) {
          drag.moved = true;
          const len = drag.end0 - drag.start0;
          let a = drag.start0 + (t - drag.t0);
          a = Math.max(0, Math.min(this.dur - len, a));
          r.start = a; r.end = a + len;
          this._seek(a); this._tip(x, a, fmtLen(len));
        }
        if (drag.mode !== 'pending') { this.render(); this.sheet.renderRanges(); this.sheet.updateSummary(); }
      });
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !this.dur) return;
        el.setPointerCapture(e.pointerId);
        const rect = el.getBoundingClientRect();
        const t = this.x2t(e.clientX - rect.left);
        const handle = e.target.closest('.tc-bar-handle');
        const rEl = e.target.closest('.tc-bar-range');
        if (handle && rEl && rEl._range) {
          drag = { mode: handle.dataset.edge, range: rEl._range, x0: e.clientX };
          handle.classList.add('tc-grab');
          this.sheet.setActive(rEl._range);
          el.classList.add('tc-dragging');
        } else if (rEl && rEl._range) {
          drag = { mode: 'move', range: rEl._range, x0: e.clientX, t0: t, start0: rEl._range.start, end0: rEl._range.end };
          this.sheet.setActive(rEl._range);
        } else {
          drag = { mode: 'pending', x0: e.clientX, t0: t };
        }
        e.preventDefault();
      });
      const end = e => {
        if (!drag) return;
        const d = drag; drag = null;
        el.classList.remove('tc-dragging');
        el.querySelectorAll('.tc-grab').forEach(x => x.classList.remove('tc-grab'));
        const rect = el.getBoundingClientRect();
        const t = this.x2t(e.clientX - rect.left);
        if (d.mode === 'pending') { this._seek(t, true); }
        else if (d.mode === 'move' && !d.moved) { this._seek(d.range.start, true); }
        else if (d.mode === 'create' && d.range.end - d.range.start < 0.3) { this.sheet.removeRange(d.range); }
        else { this.sheet.commitRanges(); }
        this.render(); this.sheet.renderRanges(); this.sheet.updateSummary();
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('keydown', e => {
        if ((e.key === 'Backspace' || e.key === 'Delete') && this.sheet.active) { this.sheet.removeRange(this.sheet.active); e.preventDefault(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
          this.sheet.player.seek(Math.max(0, Math.min(this.dur, this.sheet.player.getTime() + d)));
          e.preventDefault();
        }
      });
    }
  }

  // ------------------------------------------------------------------ szacowanie rozmiaru
  function estimateBytes(o, info, seconds) {
    if (!seconds) return 0;
    const q = (info && info.qualities) || [];
    const want = o.quality === 'best' ? 1e9 : parseInt(o.quality, 10) || 1080;
    const pick = q.find(x => x.height <= want) || q[q.length - 1];
    const height = pick ? pick.height : Math.min(want, 1080);
    const fps = (pick && pick.fps) || 30;
    const audioBps = (info && info.audioBytesPerSec) || 16000;
    if (o.mode === 'audio') {
      if (o.audioFormat === 'wav') return seconds * 288000;
      if (o.audioFormat === 'mp3') return seconds * 32000;
      return seconds * Math.max(audioBps, 16000);
    }
    const px = (height * 16 / 9) * height / (1920 * 1080);
    let vBps;
    if (o.format === 'prores') vBps = 220e6 / 8 * px * (fps / 30);
    else if (o.format === 'dnxhr') vBps = 216e6 / 8 * px * (fps / 30);
    else vBps = (pick && pick.bytesPerSec) || 600000 * px * (fps / 30) * 1.5;
    const aBps = o.mode === 'video' ? 0 : (o.format === 'original' ? audioBps : 288000);
    return seconds * (vBps + aBps);
  }

  const QUALITY_DEFAULTS = [2160, 1440, 1080, 720, 480, 360];

  // ------------------------------------------------------------------ arkusz z opcjami
  class Sheet {
    /* o: { api, player, video:{url,id,title,channel,duration,thumb}, mounts:{moments, options} | root,
            host:'youtube'|'app', onClose, theme } */
    constructor(o) {
      this.o = o;
      this.api = o.api;
      this.player = o.player;
      this.video = Object.assign({}, o.video);
      this.ranges = [];
      this.active = null;
      this.draft = null;
      this.info = null;
      this.chapters = [];
      this.opts = Object.assign({ mode: 'av', quality: '1080', format: 'original', audioFormat: 'wav', timeline: 'none', handles: 0, subs: false, markers: true, credits: true, bin: '' }, o.opts || {});
      this.status = null;
      this.jobs = [];
      this.timers = [];
      this.build();
      this.loadSettings();
      this.loadInfo();
      this.pollStatus();
      this.pollJobs();
      this._raf = 0;
      const loop = () => {
        if (this.destroyed) return;
        const t = this.player.getTime();
        if (t !== this._lastT) { this._lastT = t; this.bar.tick(t); this.updatePlayState(); this._checkPreviewEnd(t); }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    duration() { return this.video.duration || (this.info && this.info.duration) || this.player.getDuration() || 0; }

    // -------------------------------------------------------- build
    build() {
      const o = this.o;
      const v = this.video;
      // nagłówek (tylko panel w YouTube)
      if (o.host === 'youtube') {
        this.headThumb = h('img', { class: 'tc-head-thumb', alt: '', src: v.thumb || '', referrerpolicy: 'no-referrer' });
        this.headTitle = h('div', { class: 'tc-head-title' }, v.title || '');
        this.headSub = h('div', { class: 'tc-head-sub' }, this._sub());
        this.head = h('header', { class: 'tc-head' }, [
          this.headThumb,
          h('div', { style: { minWidth: '0' } }, [this.headTitle, this.headSub]),
          h('button', { class: 'tc-icon-btn', type: 'button', 'aria-label': 'Zamknij', title: 'Zamknij (Esc)', html: icon('xmark', 12, 1.8), onclick: () => o.onClose && o.onClose() })
        ]);
      }
      // momenty
      this.bar = new RangeBar(this);
      this.rangesEl = h('div', { class: 'tc-ranges', role: 'list' });
      this.playBtn = h('button', { class: 'tc-mini-btn', type: 'button', title: 'Odtwórz / pauza (spacja)', 'aria-label': 'Odtwórz', html: icon('play', 13), onclick: () => this.player.isPlaying() ? this.player.pause() : this.player.play() });
      this.inBtn = h('button', { class: 'tc-btn', type: 'button', title: 'Ustaw początek fragmentu w miejscu odtwarzania', html: icon('markIn', 14) + '<span>Początek</span><span class="tc-kbd">I</span>', onclick: () => this.markIn() });
      this.outBtn = h('button', { class: 'tc-btn', type: 'button', title: 'Ustaw koniec fragmentu w miejscu odtwarzania', html: '<span>Koniec</span>' + icon('markOut', 14) + '<span class="tc-kbd">O</span>', onclick: () => this.markOut() });
      this.hint = h('p', { class: 'tc-hint' });
      this.scaleStart = h('span', { class: 'tc-num tc-scale-a' }, '0:00');
      this.scaleEnd = h('span', { class: 'tc-num tc-scale-b' });
      this.scaleNow = h('span', { class: 'tc-num tc-now', title: 'Aktualna pozycja' });
      this.chapBtn = h('button', { class: 'tc-disclosure', type: 'button', 'aria-expanded': 'false', hidden: true, html: '<span class="tc-chev">' + icon('chevRight', 11, 2) + '</span><span>Rozdziały</span><span class="tc-count"></span>', onclick: () => this.toggle(this.chapBtn, this.chapWrap) });
      this.chapList = h('div', { class: 'tc-chapters' });
      this.chapWrap = h('div', { class: 'tc-collapse' }, h('div', null, this.chapList));
      this.momentsEl = h('section', { class: 'tc-section tc-moments' }, [
        h('div', { class: 'tc-label-row' }, [h('span', { class: 'tc-caption' }, 'Fragmenty'), h('span', { class: 'tc-caption-aux tc-num', html: '' })]),
        this.bar.el,
        (this.scaleRow = h('div', { class: 'tc-scale' }, [this.scaleStart, this.scaleNow, this.scaleEnd])),
        h('div', { class: 'tc-mark' }, [this.inBtn, this.outBtn]),
        this.rangesEl,
        this.hint,
        this.chapBtn,
        this.chapWrap
      ]);
      this.momentsCount = this.momentsEl.querySelector('.tc-caption-aux');

      // opcje
      const op = this.opts;
      this.segMode = Segmented({ label: 'Zawartość', value: op.mode, options: [
        { value: 'av', label: 'Obraz i dźwięk' }, { value: 'video', label: 'Tylko obraz' }, { value: 'audio', label: 'Tylko dźwięk' }],
        onChange: v => { this.setOpt('mode', v); this.refreshOptions(); } });
      this.popQuality = Popup({ label: 'Jakość', options: this.qualityOptions(), value: op.quality, onChange: v => this.setOpt('quality', v) });
      this.popFormat = Popup({ label: 'Format', options: this.formatOptions(), value: op.mode === 'audio' ? op.audioFormat : op.format,
        onChange: v => this.setOpt(this.opts.mode === 'audio' ? 'audioFormat' : 'format', v) });
      this.popTimeline = Popup({ label: 'Timeline', value: op.timeline, options: [
        { value: 'none', label: 'Tylko Media Pool' }, { value: 'playhead', label: 'Przy playheadzie' }, { value: 'new', label: 'Nowa timeline' }],
        onChange: v => { this.setOpt('timeline', v); this.renderTarget(); } });
      this.rowQuality = row('Jakość', this.popQuality.el);
      this.rowFormat = row('Format', this.popFormat.el);
      this.mainGroup = h('div', { class: 'tc-group' }, [
        this.rowQuality,
        this.rowFormat,
        row('Na timeline', this.popTimeline.el)
      ]);
      this.segHandles = Segmented({ label: 'Zapas', size: 'sm', value: String(op.handles || 0), options: [
        { value: '0', label: 'Brak' }, { value: '1', label: '1 s' }, { value: '2', label: '2 s' }, { value: '5', label: '5 s' }],
        onChange: v => { this.setOpt('handles', +v); this.updateSummary(); } });
      this.swSubs = Switch({ label: 'Napisy', value: op.subs, onChange: v => this.setOpt('subs', v) });
      this.swMarkers = Switch({ label: 'Rozdziały jako markery', value: op.markers, onChange: v => this.setOpt('markers', v) });
      this.swCredits = Switch({ label: 'Źródło w metadanych', value: op.credits, onChange: v => this.setOpt('credits', v) });
      this.binField = h('input', { class: 'tc-field', type: 'text', placeholder: 'Nazwa filmu', spellcheck: 'false', 'aria-label': 'Nazwa binu' });
      this.binField.addEventListener('input', () => { this.opts.bin = this.binField.value; });
      this.moreBtn = h('button', { class: 'tc-disclosure', type: 'button', 'aria-expanded': 'false', html: '<span class="tc-chev">' + icon('chevRight', 11, 2) + '</span><span>Więcej opcji</span>', onclick: () => this.toggle(this.moreBtn, this.moreWrap) });
      this.moreWrap = h('div', { class: 'tc-collapse' }, h('div', null, h('div', { class: 'tc-group', style: { margin: '2px 0 2px' } }, [
        row('Zapas na cięcia', this.segHandles.el, 'Dodatkowe sekundy przed i po fragmencie'),
        row('Napisy (.srt)', this.swSubs.el, 'Polskie i angielskie, jeśli są'),
        row('Rozdziały jako markery', this.swMarkers.el),
        row('Źródło w metadanych', this.swCredits.el, 'Link i kanał w komentarzu klipu'),
        row('Bin', this.binField)
      ])));
      this.optionsEl = h('section', { class: 'tc-section tc-options' }, [
        h('div', { class: 'tc-label-row' }, [h('span', { class: 'tc-caption' }, 'Pobieranie')]),
        h('div', { class: 'tc-mode' }, this.segMode.el),
        this.mainGroup,
        h('div', { style: { marginTop: '6px' } }, [this.moreBtn, this.moreWrap])
      ]);

      // stopka
      this.summaryL = h('span');
      this.summaryR = h('span', { class: 'tc-num' });
      this.primary = h('button', { class: 'tc-primary', type: 'button', onclick: () => this.submit() }, [
        h('span', { class: 'tc-primary-label', html: icon('download', 15, 1.8) }),
        h('span', { class: 'tc-primary-text' }, 'Pobierz do DaVinci')
      ]);
      this.primary.title = 'Pobierz do DaVinci (' + TC.keys.submit + ')';
      this.targetDot = h('span', { class: 'tc-dot' });
      this.targetText = h('span', null, 'Łączę z DaVinci…');
      this.errorLine = h('p', { class: 'tc-error-line', hidden: true });
      this.footEl = h('footer', { class: 'tc-foot' }, [
        h('div', { class: 'tc-summary' }, [this.summaryL, this.summaryR]),
        this.primary,
        this.errorLine,
        h('div', { class: 'tc-target' }, [this.targetDot, this.targetText])
      ]);
      this.jobsEl = h('div', { class: 'tc-jobs' });
      this.jobsWrap = h('div', { class: 'tc-jobs-wrap', hidden: true }, [
        h('div', { class: 'tc-divider', style: { margin: '0' } }),
        h('div', { class: 'tc-label-row', style: { margin: '12px 16px 2px' } }, [h('span', { class: 'tc-caption' }, 'Z tego filmu'), h('span', { class: 'tc-caption-aux' })]),
        this.jobsEl
      ]);

      if (o.mounts) {
        o.mounts.moments.appendChild(this.momentsEl);
        o.mounts.options.append(this.optionsEl, this.footEl, this.jobsWrap);
      } else {
        const parts = [this.head, h('div', { class: 'tc-divider', style: { margin: '0 0 14px' } }), this.momentsEl, this.optionsEl, this.footEl, this.jobsWrap];
        parts.forEach(p => p && o.root.appendChild(p));
      }
      this.renderRanges();
      this.updateSummary();
      this.renderTarget();
      this.refreshOptions();
    }
    _sub() {
      const v = this.video;
      return [v.channel, v.duration ? fmtTime(v.duration) : ''].filter(Boolean).join(' · ');
    }
    setVideo(v) {
      this.video = Object.assign({}, v);
      this.ranges = []; this.active = null; this.draft = null; this.info = null; this.chapters = [];
      if (this.head) { this.headThumb.src = v.thumb || ''; this.headTitle.textContent = v.title || ''; this.headSub.textContent = this._sub(); }
      this.bar.setStoryboard(null);
      this.binField.value = ''; this.opts.bin = '';
      this.renderRanges(); this.bar.render(); this.updateSummary(); this.renderChapters();
      this.loadInfo();
      this.renderJobs();
    }
    toggle(btn, wrap) {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      wrap.classList.toggle('tc-open', open);
    }

    // -------------------------------------------------------- dane
    async loadSettings() {
      try {
        const s = await this.api.get('/api/settings');
        ['mode', 'quality', 'format', 'audioFormat', 'timeline', 'handles', 'subs', 'markers', 'credits'].forEach(k => { if (s[k] != null) this.opts[k] = s[k]; });
        this.settings = s;
        this.segMode.set(this.opts.mode);
        this.popTimeline.set(this.opts.timeline);
        this.segHandles.set(String(this.opts.handles || 0));
        this.swSubs.set(this.opts.subs); this.swMarkers.set(this.opts.markers); this.swCredits.set(this.opts.credits);
        this.refreshOptions();
        this.renderTarget();
      } catch (e) { /* offline – obsłuży status */ }
    }
    setOpt(k, v) {
      this.opts[k] = v;
      this.updateSummary();
      clearTimeout(this._saveT);
      const payload = {}; payload[k] = v;
      this._saveT = setTimeout(() => this.api.post('/api/settings', payload).catch(() => {}), 250);
    }
    async loadInfo() {
      const url = this.video.url;
      if (!url) return;
      this._infoFor = url;
      try {
        const info = await this.api.get('/api/info?url=' + encodeURIComponent(url));
        if (this._infoFor !== url || this.destroyed) return;
        if (info.error) throw new Error(info.error);
        this.info = info;
        if (!this.video.duration) this.video.duration = info.duration;
        if (!this.video.channel) this.video.channel = info.channel;
        if (!this.video.title) this.video.title = info.title;
        if (!this.video.thumb) this.video.thumb = info.thumb;
        if (this.head) this.headSub.textContent = this._sub();
        this.chapters = info.chapters || [];
        this.bar.setStoryboard(info.storyboard || false);
        this.renderChapters();
        this.refreshOptions();
        this.updateSummary();
        this.bar.render();
        this.o.onInfo && this.o.onInfo(info);
      } catch (e) {
        if (this._infoFor !== url) return;
        this.o.onInfo && this.o.onInfo(null, e);
        this.bar.setStoryboard(false);
        this.refreshOptions();
      }
    }
    qualityOptions() {
      const info = this.info;
      const list = info && info.qualities && info.qualities.length ? info.qualities : null;
      const opts = [{ value: 'best', label: 'Najlepsza dostępna' }];
      if (list) {
        list.forEach(q => {
          const tag = q.height >= 2160 ? ' 4K' : q.height >= 1440 ? ' 2K' : '';
          opts.push({ value: String(q.height), label: q.height + 'p' + (q.fps > 30 ? q.fps : '') + tag });
        });
      } else {
        QUALITY_DEFAULTS.forEach(hh => opts.push({ value: String(hh), label: hh + 'p' + (hh >= 2160 ? ' 4K' : '') }));
      }
      return opts;
    }
    formatOptions() {
      if (this.opts.mode === 'audio') return [
        { value: 'wav', label: 'WAV · 48 kHz' }, { value: 'm4a', label: 'AAC (.m4a)' }, { value: 'mp3', label: 'MP3' }];
      return [
        { value: 'original', label: 'Oryginał (H.264)' }, { value: 'prores', label: 'ProRes 422 HQ' }, { value: 'dnxhr', label: 'DNxHR HQ' }];
    }
    refreshOptions() {
      const audio = this.opts.mode === 'audio';
      // jakość: wybierz najbliższą dostępną
      const qopts = this.qualityOptions();
      let q = String(this.opts.quality);
      if (!qopts.some(x => x.value === q)) {
        const want = parseInt(q, 10) || 1080;
        const lower = qopts.filter(x => x.value !== 'best' && +x.value <= want);
        q = lower.length ? lower[0].value : 'best';
      }
      this.popQuality.setOptions(qopts, q);
      this.rowQuality.style.display = audio ? 'none' : '';
      this.popFormat.setOptions(this.formatOptions(), audio ? this.opts.audioFormat : this.opts.format);
      if (!this.popFormat.get()) this.popFormat.select.selectedIndex = 0;
      this.updateSummary();
    }

    // -------------------------------------------------------- fragmenty
    sortedRanges() { return this.ranges.slice().sort((a, b) => a.start - b.start); }
    addRange(a, b, silent) {
      const dur = this.duration();
      const r = { start: Math.max(0, a), end: dur ? Math.min(dur, b) : b };
      this.ranges.push(r);
      this.active = r;
      if (!silent) this.commitRanges();
      return r;
    }
    removeRange(r) {
      this.ranges = this.ranges.filter(x => x !== r);
      if (this.active === r) this.active = this.ranges[this.ranges.length - 1] || null;
      this.commitRanges();
    }
    setActive(r) { this.active = r; this.renderRanges(); this.bar.render(); }
    commitRanges() {
      this.ranges.forEach(r => { r.start = Math.round(r.start * 10) / 10; r.end = Math.round(r.end * 10) / 10; });
      this.renderRanges(); this.bar.render(); this.updateSummary(); this.renderChapters();
    }
    markIn() {
      const t = this.player.getTime();
      this.draft = t;
      this.bar.render();
      this.flash(this.inBtn);
      this.updateHint();
      this.updateSummary();
    }
    markOut() {
      const t = this.player.getTime();
      let a = this.draft;
      if (a == null) a = Math.max(0, t - 10);
      this.draft = null;
      const s = Math.min(a, t), e = Math.max(a, t);
      if (e - s >= 0.3) this.addRange(s, e);
      else this.bar.render();
      this.flash(this.outBtn);
      this.updateHint();
      this.updateSummary();
    }
    flash(btn) {
      btn.animate([{ transform: 'scale(0.96)', background: 'var(--tc-fill)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
    previewRange(r) {
      this._previewEnd = r.end;
      this.player.seek(r.start);
      this.player.play();
    }
    _checkPreviewEnd(t) {
      if (this._previewEnd != null && t >= this._previewEnd) { this._previewEnd = null; this.player.pause(); }
    }
    updatePlayState() {
      const t = this.player.getTime();
      this.scaleNow.textContent = fmtTime(t, true);
      const w = this.scaleRow.clientWidth, dur = this.duration();
      if (!w) return;
      const x = Math.max(24, Math.min(w - 24, dur ? (t / dur) * w : 0));
      this.scaleNow.style.left = x + 'px';
      this.scaleStart.style.opacity = x < 64 ? '0' : '1';
      this.scaleEnd.style.opacity = x > w - 64 ? '0' : '1';
    }
    renderRanges() {
      const list = this.sortedRanges();
      if (this._editing) return;
      this.rangesEl.innerHTML = '';
      list.forEach((r, i) => {
        const inA = h('input', { class: 'tc-time', value: fmtTime(r.start, true), 'aria-label': 'Początek fragmentu ' + (i + 1), spellcheck: 'false' });
        const inB = h('input', { class: 'tc-time', value: fmtTime(r.end, true), 'aria-label': 'Koniec fragmentu ' + (i + 1), spellcheck: 'false' });
        const bindTime = (input, key) => {
          input.addEventListener('focus', () => { this._editing = true; input.select(); this.setActiveQuiet(r); });
          input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = fmtTime(r[key], true); input.blur(); } e.stopPropagation(); });
          input.addEventListener('blur', () => {
            this._editing = false;
            const v = parseTime(input.value);
            const dur = this.duration();
            if (isNaN(v) || v < 0 || (dur && v > dur + 0.05)) { input.classList.add('tc-invalid'); setTimeout(() => { input.classList.remove('tc-invalid'); this.renderRanges(); }, 900); return; }
            r[key] = v;
            if (r.end < r.start) { const tmp = r.start; r.start = r.end; r.end = tmp; }
            if (r.end - r.start < 0.2) r.end = r.start + 0.2;
            this.commitRanges();
            this.player.seek(r[key]);
          });
        };
        bindTime(inA, 'start'); bindTime(inB, 'end');
        this._seen = this._seen || new WeakSet();
        const fresh = !this._seen.has(r);
        this._seen.add(r);
        const rowEl = h('div', { class: 'tc-range-row' + (r === this.active ? ' tc-active' : '') + (fresh ? ' tc-new' : ''), role: 'listitem' }, [
          h('span', { class: 'tc-range-badge' }, String(i + 1)),
          h('div', { class: 'tc-range-times' }, [inA, h('span', { class: 'tc-range-arrow' }, '–'), inB, h('span', { class: 'tc-range-len' }, fmtLen(r.end - r.start))]),
          h('div', { class: 'tc-row-actions' }, [
            h('button', { class: 'tc-mini-btn', type: 'button', title: 'Odtwórz fragment', 'aria-label': 'Odtwórz fragment ' + (i + 1), html: icon('play', 12), onclick: () => this.previewRange(r) }),
            h('button', { class: 'tc-mini-btn tc-danger', type: 'button', title: 'Usuń fragment', 'aria-label': 'Usuń fragment ' + (i + 1), html: icon('xmark', 11, 1.8), onclick: () => this.removeRange(r) })
          ])
        ]);
        rowEl.addEventListener('pointerdown', e => { if (!e.target.closest('button,input')) { this.setActive(r); this.player.seek(r.start); } });
        this.rangesEl.appendChild(rowEl);
      });
      this.momentsCount.textContent = list.length ? list.length + ' ' + plural(list.length, 'zaznaczony', 'zaznaczone', 'zaznaczonych') : '';
      this.updateHint();
    }
    setActiveQuiet(r) { this.active = r; this.bar.render(); }
    updateHint() {
      const n = this.ranges.length;
      if (this.draft != null) this.hint.innerHTML = 'Początek: <b>' + fmtTime(this.draft, true) + '</b>. Przewiń do końca ujęcia i <span class="tc-nowrap">naciśnij <span class="tc-kbd">O</span></span>.';
      else if (!n) this.hint.innerHTML = 'Przeciągnij po pasku albo w trakcie oglądania naciśnij <span class="tc-kbd">I</span> i <span class="tc-kbd">O</span>. Bez zaznaczenia pobierze się cały film.';
      else this.hint.innerHTML = 'Uchwyty na pasku zmieniają granice. Każdy fragment trafi do DaVinci jako osobny klip.';
    }
    renderChapters() {
      const ch = this.chapters || [];
      this.chapBtn.hidden = !ch.length;
      this.chapBtn.querySelector('.tc-count').textContent = ch.length ? String(ch.length) : '';
      this.chapList.innerHTML = '';
      ch.forEach(c => {
        const added = this.ranges.some(r => Math.abs(r.start - c.start) < 0.15 && Math.abs(r.end - c.end) < 0.15);
        this.chapList.appendChild(h('button', { class: 'tc-chapter' + (added ? ' tc-added' : ''), type: 'button', title: added ? 'Dodane jako fragment' : 'Dodaj rozdział jako fragment',
          onclick: () => { if (!added) { this.addRange(c.start, c.end); this.player.seek(c.start); } } }, [
          h('span', { class: 'tc-chapter-t' }, fmtTime(c.start)),
          h('span', { class: 'tc-chapter-n' }, c.title || 'Rozdział'),
          h('span', { class: 'tc-plus', html: icon(added ? 'check' : 'plus', 13, 1.9) })
        ]));
      });
      this.bar.renderChapters();
    }

    // -------------------------------------------------------- podsumowanie + cel
    totalSeconds() {
      const hd = +this.opts.handles || 0;
      const dur = this.duration();
      if (!this.ranges.length) return dur;
      return this.ranges.reduce((s, r) => s + (Math.min(dur || 1e9, r.end + hd) - Math.max(0, r.start - hd)), 0);
    }
    updateSummary() {
      const n = this.ranges.length;
      const dur = this.duration();
      this.scaleEnd.textContent = dur ? fmtTime(dur) : '–:––';
      const secs = n ? this.ranges.reduce((s, r) => s + (r.end - r.start), 0) : dur;
      const txt = this.primary.querySelector('.tc-primary-text');
      if (!this.primary.classList.contains('tc-sent')) txt.textContent = this.draft != null ? 'Zakończ fragment i pobierz' : 'Pobierz do DaVinci';
      if (this.draft != null) {
        this.summaryL.innerHTML = '<strong>Fragment w toku</strong> · od ' + fmtTime(this.draft, true) + (n ? ' · +' + n + ' ' + plural(n, 'gotowy', 'gotowe', 'gotowych') : '');
        this.summaryR.textContent = '';
        this.primary.disabled = !!this.offline;
        return;
      }
      if (n) this.summaryL.innerHTML = '<strong>' + n + ' ' + plural(n, 'fragment', 'fragmenty', 'fragmentów') + '</strong> · ' + fmtLen(secs);
      else this.summaryL.innerHTML = '<strong>Cały film</strong>' + (dur ? ' · ' + fmtTime(dur) : '');
      const bytes = estimateBytes(this.opts, this.info, this.totalSeconds());
      this.summaryR.textContent = bytes ? 'ok. ' + fmtBytes(bytes) : '';
      this.primary.disabled = !!this.offline;
    }
    renderTarget() {
      const st = this.status;
      this.targetDot.className = 'tc-dot';
      if (this.offline) {
        this.targetText.textContent = 'TDE Clip nie działa';
        return;
      }
      if (!st) { this.targetText.textContent = 'Łączę z DaVinci…'; return; }
      const r = st.resolve || {};
      if (r.connected && r.project) {
        this.targetDot.classList.add('tc-on');
        let where = r.project + (r.timeline ? ' › ' + r.timeline : '');
        if (this.opts.timeline === 'playhead' && r.timecode) where += ' · od ' + r.timecode;
        if (this.opts.timeline === 'playhead' && !r.timeline) { this.targetDot.className = 'tc-dot tc-warn'; where = r.project + ' · brak otwartej timeline'; }
        this.targetText.textContent = where;
        this.targetText.title = where;
      } else {
        this.targetDot.classList.add('tc-warn');
        this.targetText.textContent = 'DaVinci zamknięty – pliki trafią do folderu, zaimportujesz je później';
      }
    }
    async pollStatus() {
      if (this.destroyed) return;
      try {
        this.status = await this.api.get('/api/status');
        if (this.offline) { this.offline = false; this.o.onOnline && this.o.onOnline(); this.loadSettings(); if (!this.info) this.loadInfo(); }
      } catch (e) {
        if (!this.offline) { this.offline = true; this.o.onOffline && this.o.onOffline(); }
      }
      this.renderTarget();
      this.updateSummary();
      this.timers.push(setTimeout(() => this.pollStatus(), this.offline ? 2500 : 4000));
    }
    async pollJobs() {
      if (this.destroyed) return;
      let active = false;
      try {
        const d = await this.api.get('/api/jobs');
        this.jobs = d.jobs || [];
        active = this.jobs.some(j => ACTIVE.has(j.status));
        this.renderJobs();
      } catch (e) { }
      this.timers.push(setTimeout(() => this.pollJobs(), active ? 700 : 3000));
    }
    renderJobs() {
      const mine = this.jobs.filter(j => j.vid && j.vid === this.video.id).slice(0, 6);
      this.jobsWrap.hidden = !mine.length;
      if (!this.jobList) this.jobList = new JobList(this.jobsEl, this.api, { compact: true });
      this.jobList.update(mine);
    }

    // -------------------------------------------------------- wysyłka
    async submit() {
      if (this.primary.disabled || this._sending) return;
      this.errorLine.hidden = true;
      if (this.draft != null) {
        if (this.player.getTime() - this.draft < 0.3) {
          this.errorLine.textContent = 'Przewiń do końca ujęcia i naciśnij O – albo usuń początek klawiszem Esc.';
          this.errorLine.hidden = false;
          return;
        }
        this.markOut();
      }
      this._sending = true;
      const v = this.video;
      const payload = {
        url: v.url, title: v.title, channel: v.channel, thumb: v.thumb, duration: this.duration(),
        chapters: this.chapters, source: this.o.host,
        ranges: this.sortedRanges().map(r => ({ start: r.start, end: r.end })),
        opts: Object.assign({}, this.opts, { bin: (this.binField.value || '').trim() })
      };
      try {
        const res = await this.api.post('/api/jobs', payload);
        if (!res || res.error) throw new Error(res && res.error || 'Nie udało się dodać');
        this.primary.classList.add('tc-sent');
        const txt = this.primary.querySelector('.tc-primary-text');
        const ic = this.primary.querySelector('.tc-primary-label');
        txt.textContent = 'Dodano do kolejki';
        ic.innerHTML = icon('check', 15, 2);
        setTimeout(() => { this.primary.classList.remove('tc-sent'); txt.textContent = 'Pobierz do DaVinci'; ic.innerHTML = icon('download', 15, 1.8); }, 1600);
        this.jobs.unshift(res.job);
        this.renderJobs();
        clearTimeout(this._fastPoll);
        this._fastPoll = setTimeout(() => this.pollJobs(), 400);
      } catch (e) {
        this.errorLine.textContent = e.message || String(e);
        this.errorLine.hidden = false;
      } finally {
        this._sending = false;
      }
    }

    // -------------------------------------------------------- klawiatura (wołane przez hosta)
    handleKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { this.submit(); return true; }
      if (e.key === 'Escape' && this.draft != null && !typing) { this.draft = null; this.bar.render(); this.updateHint(); this.updateSummary(); return true; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return false;
      const k = e.key.toLowerCase();
      if (k === 'i') { this.markIn(); return true; }
      if (k === 'o') { this.markOut(); return true; }
      if (k === 'x' && this.active) { this.removeRange(this.active); return true; }
      if (e.key === 'Escape' && this.draft != null) { this.draft = null; this.bar.render(); this.updateHint(); this.updateSummary(); return true; }
      return false;
    }
    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this._raf);
      this.timers.forEach(clearTimeout);
    }
  }
  TC.Sheet = Sheet;

  // ------------------------------------------------------------------ lista pobrań
  const ACTIVE = new Set(['queued', 'downloading', 'processing', 'importing']);
  TC.ACTIVE = ACTIVE;
  class JobList {
    constructor(el, api, o) { this.el = el; this.api = api; this.o = o || {}; this.rows = new Map(); }
    update(jobs) {
      const seen = new Set();
      jobs.forEach((j, i) => {
        seen.add(j.id);
        let r = this.rows.get(j.id);
        if (!r) { r = this.makeRow(j); this.rows.set(j.id, r); }
        if (this.el.children[i] !== r.el) this.el.insertBefore(r.el, this.el.children[i] || null);
        this.fill(r, j);
      });
      for (const [id, r] of this.rows) if (!seen.has(id)) { r.el.remove(); this.rows.delete(id); }
    }
    makeRow(j) {
      const r = {};
      r.thumb = h('img', { class: 'tc-job-thumb', alt: '', src: j.thumb || '', referrerpolicy: 'no-referrer', loading: 'lazy' });
      r.title = h('div', { class: 'tc-job-title' });
      r.stage = h('div', { class: 'tc-job-stage' });
      r.bar = h('i');
      r.prog = h('div', { class: 'tc-progress' }, r.bar);
      r.actions = h('div', { class: 'tc-job-actions' });
      r.el = h('div', { class: 'tc-job' }, [r.thumb, h('div', { class: 'tc-job-main' }, [r.title, r.stage, r.prog]), r.actions]);
      return r;
    }
    fill(r, j) {
      const active = ACTIVE.has(j.status);
      const label = j.count > 1 ? j.count + ' ' + plural(j.count, 'fragment', 'fragmenty', 'fragmentów') : (j.ranges && j.ranges.length ? '1 fragment' : 'cały film');
      r.title.textContent = this.o.compact ? label.charAt(0).toUpperCase() + label.slice(1) + ' · ' + modeLabel(j) : j.title;
      r.title.title = j.title;
      let stage = j.stage || '';
      if (j.status === 'downloading' && j.speed) stage += ' · ' + j.speed + (j.eta ? ' · zostało ' + j.eta : '');
      if (j.status === 'done' && j.bytes) stage = fmtBytes(j.bytes) + ' · ' + stage;
      if (!this.o.compact && !active && j.status !== 'error') stage = label.charAt(0).toUpperCase() + label.slice(1) + ' · ' + stage;
      r.stage.textContent = stage;
      r.stage.title = stage;
      r.stage.className = 'tc-job-stage' + (j.status === 'error' ? ' tc-err' : '');
      r.prog.hidden = !active;
      r.prog.classList.toggle('tc-indet', j.status === 'queued' || j.status === 'importing' || (j.progress || 0) < 2);
      r.bar.style.width = Math.max(2, Math.min(100, j.progress || 0)) + '%';
      const key = j.status;
      if (r.key === key) return;
      const prev = r.key; r.key = key;
      r.actions.innerHTML = '';
      const btn = (ic, title, fn, cls) => h('button', { class: 'tc-mini-btn' + (cls ? ' ' + cls : ''), type: 'button', title, 'aria-label': title, html: icon(ic, 13, 1.7), onclick: fn });
      const post = (p) => () => this.api.post(p, { id: j.id }).then(() => this.o.onChange && this.o.onChange());
      if (active) r.actions.append(btn('stop', 'Anuluj', post('/api/cancel'), 'tc-danger'));
      else {
        if (j.status === 'done') r.actions.append(h('span', { class: 'tc-status-icon tc-ok' + (prev ? ' tc-pop' : ''), title: 'Gotowe', html: icon('checkCircle', 17) }));
        if (j.status === 'downloaded') r.actions.append(btn('download', 'Importuj do DaVinci', post('/api/retry')));
        if (j.status === 'error' || j.status === 'canceled') r.actions.append(btn('retry', 'Spróbuj ponownie', post('/api/retry')));
        if (j.status !== 'canceled') r.actions.append(btn('folder', 'Pokaż w Finderze', post('/api/reveal')));
      }
    }
  }
  function modeLabel(j) {
    const o = j.opts || {};
    if (o.mode === 'audio') return ({ wav: 'WAV', m4a: 'AAC', mp3: 'MP3' })[o.audioFormat] || 'dźwięk';
    const f = ({ original: 'H.264', prores: 'ProRes', dnxhr: 'DNxHR' })[o.format] || '';
    const q = o.quality === 'best' ? 'max' : (o.quality + 'p');
    return [q, f, o.mode === 'video' ? 'bez dźwięku' : ''].filter(Boolean).join(' · ');
  }
  TC.JobList = JobList;
  TC.modeLabel = modeLabel;
})(typeof window !== 'undefined' ? window : globalThis);
