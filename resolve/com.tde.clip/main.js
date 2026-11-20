// TDE Clip – okno w DaVinci Resolve (Workflow Integration / Electron).
// Okno ładuje interfejs z lokalnego silnika (http://127.0.0.1:8770/app/),
// a gdy silnik nie działa – najpierw go uruchamia.
const { app, BrowserWindow, Menu, shell, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8770;
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const URL = 'http://127.0.0.1:' + PORT + '/app/?shell=electron&os=' + (IS_WIN ? 'win' : IS_MAC ? 'mac' : 'linux');

function config() {
  const tries = [path.join(__dirname, 'tdeclip.json'), path.join(__dirname, '..', '..', 'config.json')];
  for (const f of tries) {
    try { const c = JSON.parse(fs.readFileSync(f, 'utf8')); if (c.root) return c; } catch (e) { }
  }
  return { root: path.resolve(__dirname, '..', '..'), python: IS_WIN ? 'pythonw' : '/usr/bin/python3' };
}
const CFG = config();

function ping() {
  return new Promise(res => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/status', timeout: 800 }, r => { r.resume(); res(r.statusCode === 200); });
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });
}

async function ensureEngine() {
  if (await ping()) return true;
  try {
    const logDir = path.join(CFG.root, 'data');
    fs.mkdirSync(logDir, { recursive: true });
    const out = fs.openSync(path.join(logDir, 'server.log'), 'a');
    let py = CFG.python;
    if (IS_WIN) { const w = py.replace(/python\.exe$/i, 'pythonw.exe'); if (w !== py && fs.existsSync(w)) py = w; }
    const env = Object.assign({}, process.env);
    if (!IS_WIN) env.PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
    const child = spawn(py, [path.join(CFG.root, 'server', 'clip_server.py')], {
      cwd: path.join(CFG.root, 'server'), detached: true, stdio: ['ignore', out, out], windowsHide: true, env
    });
    child.unref();
  } catch (e) { return false; }
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (await ping()) return true;
  }
  return false;
}

let win = null;
// Windows: systemowe przyciski okna nad naszym paskiem narzędzi
const overlay = dark => ({ color: dark ? '#1e1e1f' : '#ffffff', symbolColor: dark ? '#ffffff' : '#1d1d1f', height: 52 });
const ERROR_PAGE = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1e1e1f;color:#fff;font:13px -apple-system,system-ui;-webkit-app-region:drag">
<div style="text-align:center;max-width:380px"><h2 style="font-size:17px;margin:0 0 8px">Nie mogę uruchomić silnika TDE Clip</h2>
<p style="color:rgba(235,235,245,.6);line-height:1.5">Uruchom raz <b>Zainstaluj.command</b> z folderu tde-clip, a potem otwórz to okno ponownie.</p></div></body></html>`);

async function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  const chrome = IS_MAC
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 19 }, vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' }
    : { titleBarStyle: 'hidden', titleBarOverlay: overlay(dark), backgroundMaterial: 'mica', backgroundColor: dark ? '#1e1e1f' : '#ffffff',
        autoHideMenuBar: true, icon: path.join(CFG.root, 'extension', 'icons', 'icon-256.png') };
  win = new BrowserWindow(Object.assign({
    width: 1240, height: 800, minWidth: 940, minHeight: 600,
    title: 'TDE Clip', show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  }, chrome));
  if (!IS_MAC) nativeTheme.on('updated', () => { try { win.setTitleBarOverlay(overlay(nativeTheme.shouldUseDarkColors)); } catch (e) { } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('http://127.0.0.1:' + PORT)) { e.preventDefault(); shell.openExternal(url); } });
  win.once('ready-to-show', () => win.show());
  const ok = await ensureEngine();
  await win.loadURL(ok ? URL : ERROR_PAGE);
  if (!win.isVisible()) win.show();
}

function buildMenu() {
  if (!IS_MAC) { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'TDE Clip', submenu: [{ role: 'about', label: 'O TDE Clip' }, { type: 'separator' }, { role: 'hide', label: 'Ukryj TDE Clip' }, { role: 'hideOthers', label: 'Ukryj pozostałe' }, { type: 'separator' }, { role: 'quit', label: 'Zakończ TDE Clip' }] },
    { label: 'Edycja', submenu: [{ role: 'undo', label: 'Cofnij' }, { role: 'redo', label: 'Powtórz' }, { type: 'separator' }, { role: 'cut', label: 'Wytnij' }, { role: 'copy', label: 'Kopiuj' }, { role: 'paste', label: 'Wklej' }, { role: 'selectAll', label: 'Zaznacz wszystko' }] },
    { label: 'Widok', submenu: [{ role: 'reload', label: 'Odśwież' }, { role: 'toggleDevTools', label: 'Narzędzia deweloperskie' }, { type: 'separator' }, { role: 'resetZoom', label: 'Rzeczywisty rozmiar' }, { role: 'zoomIn', label: 'Powiększ' }, { role: 'zoomOut', label: 'Pomniejsz' }] },
    { label: 'Okno', submenu: [{ role: 'minimize', label: 'Minimalizuj' }, { role: 'zoom', label: 'Powiększ okno' }, { role: 'close', label: 'Zamknij' }] }
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName('TDE Clip');
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    try {
      const icon = nativeImage.createFromPath(path.join(CFG.root, 'extension', 'icons', 'icon-512.png'));
      if (!icon.isEmpty() && app.dock) app.dock.setIcon(icon);
    } catch (e) { }
    app.setAboutPanelOptions({ applicationName: 'TDE Clip', applicationVersion: '1.0', copyright: 'YouTube → DaVinci Resolve' });
    buildMenu();
    createWindow();
  });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
