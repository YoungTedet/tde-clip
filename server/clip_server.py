#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TDE Clip - silnik.

Lokalny serwer (127.0.0.1:8770), z którego korzystają oba interfejsy:
  * rozszerzenie Chrome (przycisk „DaVinci” pod filmem na YouTube),
  * okno „TDE Clip” w DaVinci Resolve (wyszukiwarka).

Robi: szukanie i info o filmie (yt-dlp), pobieranie wybranych fragmentów
(albo całości) w wybranej jakości, konwersję do formatu montażowego
(ffmpeg / VideoToolbox), import do nowego binu w Media Poolu i opcjonalnie
ułożenie na timeline (przy playheadzie albo na nowej timeline).

Uruchamianie:  python3 clip_server.py   (bez argumentów; port: TDE_CLIP_PORT)
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.0.0"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.join(ROOT, "app")
UI_DIR = os.path.join(ROOT, "extension", "ui")
ICON_DIR = os.path.join(ROOT, "extension", "icons")
DATA_DIR = os.path.join(ROOT, "data")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
JOBS_FILE = os.path.join(DATA_DIR, "jobs.json")
LOG_FILE = os.path.join(DATA_DIR, "server.log")
PID_FILE = os.path.join(DATA_DIR, "server.pid")
PORT = int(os.environ.get("TDE_CLIP_PORT", "8770"))
IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"
PARENT_BIN = "TDE Clip"
MAX_PARALLEL = 2

if IS_WIN:
    _pd = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    RESOLVE_MODULES = os.path.join(_pd, "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Scripting", "Modules")
    _lib = os.path.join(os.environ.get("PROGRAMFILES", r"C:\Program Files"), "Blackmagic Design", "DaVinci Resolve", "fusionscript.dll")
    os.environ.setdefault("RESOLVE_SCRIPT_API", os.path.join(_pd, "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Scripting"))
    if os.path.isfile(_lib):
        os.environ.setdefault("RESOLVE_SCRIPT_LIB", _lib)
    _la = os.environ.get("LOCALAPPDATA", os.path.expanduser(r"~\AppData\Local"))
    SEARCH_PATHS = [os.path.join(ROOT, "bin"), os.path.join(_la, "Microsoft", "WinGet", "Links"),
                    os.path.expanduser(r"~\scoop\shims"), r"C:\ProgramData\chocolatey\bin", r"C:\ffmpeg\bin"]
    # programy konsolowe bez migającego okna
    NOWIN = {"creationflags": 0x08000000}
else:
    RESOLVE_MODULES = "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules"
    # Odpalane z Resolve / Chrome nie widzi PATH Terminala (brak /opt/homebrew/bin).
    SEARCH_PATHS = [os.path.join(ROOT, "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/opt/local/bin",
                    os.path.expanduser("~/.local/bin")]
    NOWIN = {}
# yt-dlp odpala własny ffmpeg – trzymamy je w jednej grupie procesów, żeby anulowanie zabiło oba
GROUP = {"creationflags": 0x08000000 | 0x00000200} if IS_WIN else {"start_new_session": True}
UPDATE_HINT = "winget upgrade yt-dlp.yt-dlp" if IS_WIN else "brew upgrade yt-dlp"
os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def find_tool(name):
    for d in SEARCH_PATHS:
        for n in ((name + ".exe", name) if IS_WIN else (name,)):
            p = os.path.join(d, n)
            if os.path.isfile(p) and os.access(p, os.X_OK):
                return p
    return shutil.which(name)


def open_path(path, reveal=False):
    """Pokaż plik/folder w Finderze albo Eksploratorze."""
    if IS_WIN:
        if reveal and os.path.isfile(path):
            subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
        else:
            os.startfile(os.path.normpath(path))  # noqa
    elif IS_MAC:
        subprocess.Popen(["open", "-R", path] if reveal else ["open", path])
    else:
        subprocess.Popen(["xdg-open", os.path.dirname(path) if reveal else path])


def open_url(url):
    if IS_WIN:
        os.startfile(url)  # noqa
    elif IS_MAC:
        subprocess.Popen(["open", url])
    else:
        subprocess.Popen(["xdg-open", url])


def choose_folder(current):
    """Systemowe okno wyboru folderu. Zwraca ścieżkę albo None."""
    if IS_WIN:
        ps = ("Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; "
              "$d.Description = 'Wybierz folder na pobrane filmy'; $d.SelectedPath = '%s'; "
              "if ($d.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.SelectedPath }"
              % current.replace("'", "''"))
        r = subprocess.run(["powershell", "-NoProfile", "-STA", "-Command", ps], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=600, **NOWIN)
        path = (r.stdout or "").strip()
    elif IS_MAC:
        script = ('POSIX path of (choose folder with prompt "Wybierz folder na pobrane filmy" '
                  'default location (POSIX file "%s"))' % current.replace('"', ''))
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=600)
        path = (r.stdout or "").strip().rstrip("/")
    else:
        return None
    return path if r.returncode == 0 and path else None


YTDLP = find_tool("yt-dlp")
FFMPEG = find_tool("ffmpeg")
FFPROBE = find_tool("ffprobe")
if FFMPEG:
    os.environ["PATH"] = os.path.dirname(FFMPEG) + os.pathsep + os.environ.get("PATH", "")

DEFAULTS = {
    "folder": os.path.join(os.path.expanduser("~"), "Videos" if IS_WIN else "Movies", "TDE Clip"),
    "mode": "av",              # av | video | audio
    "quality": "1080",         # best | 2160 | 1440 | 1080 | 720 | 480 | 360
    "format": "original",      # original | prores | dnxhr
    "audioFormat": "wav",      # wav | m4a | mp3
    "timeline": "none",        # none | playhead | new
    "handles": 0,              # sekundy zapasu na cięcia
    "subs": False,
    "markers": True,
    "credits": True,
    "cookies": "",             # "" | chrome | safari | firefox
    "results": 24,
}

_jobs_lock = threading.Lock()
_resolve_lock = threading.Lock()
_log_lock = threading.Lock()
_slots = threading.Semaphore(MAX_PARALLEL)
JOBS = []
PROCS = {}
_resolve = None
_status_cache = {"t": 0, "data": None}
_info_cache = {}


# ------------------------------------------------------------------ helpers
def log(text):
    line = time.strftime("%H:%M:%S ") + str(text)
    print(line, flush=True)
    with _log_lock:
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass


def load_settings():
    s = dict(DEFAULTS)
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            s.update({k: v for k, v in json.load(f).items() if k in DEFAULTS})
    except (OSError, ValueError):
        pass
    return s


def save_settings(new):
    s = load_settings()
    s.update({k: v for k, v in (new or {}).items() if k in DEFAULTS and v is not None})
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=2)
    return s


def save_jobs():
    with _jobs_lock:
        data = [dict(j, log=j.get("log", [])[-60:]) for j in JOBS[-80:]]
    try:
        with open(JOBS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except OSError:
        pass


def load_jobs():
    try:
        with open(JOBS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return
    for j in data:
        if j.get("status") in ("queued", "downloading", "processing", "importing"):
            j["status"] = "error"
            j["stage"] = "Przerwane – serwer został zamknięty"
    with _jobs_lock:
        JOBS[:] = data


def get_job(jid):
    with _jobs_lock:
        for j in JOBS:
            if j["id"] == jid:
                return j
    return None


def upd(job, **kw):
    with _jobs_lock:
        job.update(kw)
        job["updated"] = time.time()


def jlog(job, text):
    text = str(text).rstrip()
    if not text:
        return
    with _jobs_lock:
        job.setdefault("log", []).append(time.strftime("%H:%M:%S ") + text)
        if len(job["log"]) > 400:
            job["log"] = job["log"][-300:]


def youtube_id(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None


def is_url(text):
    return bool(re.match(r"^(https?://|www\.|youtu\.be/|youtube\.com/)", (text or "").strip(), re.I))


def safe_name(text, limit=90):
    text = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", text or "").strip(" .")
    text = re.sub(r"\s+", " ", text)
    return (text[:limit].rstrip(" .") or "film")


def tc_name(sec):
    sec = max(0, int(round(sec)))
    h, rest = divmod(sec, 3600)
    m, s = divmod(rest, 60)
    return ("%dh%02dm%02ds" % (h, m, s)) if h else ("%dm%02ds" % (m, s))


def best_thumb(entry):
    best = None
    for t in entry.get("thumbnails") or []:
        if t.get("url") and (best is None or (t.get("width") or 0) > (best.get("width") or 0)):
            best = t
    if best:
        return best["url"]
    if entry.get("thumbnail"):
        return entry["thumbnail"]
    vid = entry.get("id")
    return "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid if vid else ""


def cookie_args(settings):
    c = (settings.get("cookies") or "").strip()
    return ["--cookies-from-browser", c] if c else []


def ytdlp_json(args, settings, timeout=90):
    if not YTDLP:
        raise RuntimeError("Nie znaleziono yt-dlp. W Terminalu: brew install yt-dlp")
    cmd = [YTDLP, "--no-warnings", "-J"] + cookie_args(settings) + args
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace", **NOWIN)
    if not r.stdout.strip():
        msg = (r.stderr or "yt-dlp: nieznany błąd").strip().splitlines()
        raise RuntimeError(friendly_error("\n".join(msg[-4:])))
    return json.loads(r.stdout)


def friendly_error(text):
    t = text or ""
    if "Sign in to confirm" in t or "not a bot" in t:
        return "YouTube prosi o potwierdzenie, że nie jesteś botem. W Ustawieniach wybierz ciasteczka z przeglądarki."
    if "age" in t.lower() and "restricted" in t.lower() or "inappropriate" in t:
        return "Film z ograniczeniem wiekowym – w Ustawieniach wybierz ciasteczka z przeglądarki."
    if "Private video" in t:
        return "To prywatny film – nie da się go pobrać."
    if "HTTP Error 403" in t:
        return "YouTube odmówił (403). Zaktualizuj yt-dlp: " + UPDATE_HINT
    if "Video unavailable" in t:
        return "Film jest niedostępny."
    last = [l for l in t.splitlines() if l.strip()]
    return (last[-1] if last else "Nieznany błąd").replace("ERROR: ", "")[:300]


# ------------------------------------------------------------------ search / info
def entry_summary(e):
    vid = e.get("id")
    return {
        "id": vid,
        "url": e.get("webpage_url") or ("https://www.youtube.com/watch?v=%s" % vid),
        "title": e.get("title") or "(bez tytułu)",
        "channel": e.get("channel") or e.get("uploader") or "",
        "duration": e.get("duration"),
        "views": e.get("view_count"),
        "thumb": best_thumb(e),
        "date": e.get("upload_date"),
        "live": e.get("live_status") in ("is_live", "is_upcoming"),
    }


def search(query, n, sort, settings):
    query = (query or "").strip()
    if not query:
        return {"results": [], "kind": "empty"}
    if is_url(query):
        if not query.startswith("http"):
            query = "https://" + query
        data = ytdlp_json(["--flat-playlist", query], settings)
        if data.get("_type") == "playlist":
            res = [entry_summary(e) for e in data.get("entries") or [] if e and e.get("id")]
            return {"results": res, "kind": "playlist", "title": data.get("title")}
        return {"results": [entry_summary(data)], "kind": "link"}
    prefix = "ytsearchdate" if sort == "date" else "ytsearch"
    data = ytdlp_json(["--flat-playlist", "%s%d:%s" % (prefix, n, query)], settings)
    res = [entry_summary(e) for e in data.get("entries") or [] if e and e.get("id")]
    res = [r for r in res if "/shorts/" not in (r["url"] or "")] + \
          [r for r in res if "/shorts/" in (r["url"] or "")]
    return {"results": res, "kind": "search"}


def video_info(url, settings):
    vid = youtube_id(url)
    key = vid or url
    hit = _info_cache.get(key)
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    data = ytdlp_json(["--no-playlist", url], settings, timeout=120)
    formats = data.get("formats") or []
    dur = data.get("duration") or 0
    qualities = {}
    for f in formats:
        h, vc = f.get("height"), (f.get("vcodec") or "none")
        if not h or vc == "none" or f.get("format_note") == "storyboard":
            continue
        size = f.get("filesize") or f.get("filesize_approx") or \
            ((f.get("tbr") or 0) * 1000 / 8 * dur if f.get("tbr") else 0)
        q = qualities.setdefault(h, {"height": h, "fps": 0, "codecs": set(), "bytes_per_s": 0})
        q["fps"] = max(q["fps"], int(f.get("fps") or 0))
        q["codecs"].add(vc[:4])
        if dur and size:
            q["bytes_per_s"] = max(q["bytes_per_s"], size / dur)
    audio_bps = 0
    for f in formats:
        if (f.get("vcodec") or "none") == "none" and f.get("acodec") not in (None, "none"):
            size = f.get("filesize") or f.get("filesize_approx") or 0
            if dur and size:
                audio_bps = max(audio_bps, size / dur)
    qlist = []
    for h in sorted(qualities, reverse=True):
        q = qualities[h]
        if h < 144:
            continue
        qlist.append({"height": h, "fps": q["fps"], "h264": "avc1" in q["codecs"],
                      "bytesPerSec": int(q["bytes_per_s"])})
    storyboard = None
    for f in formats:
        if f.get("format_note") == "storyboard" and f.get("fragments") and f.get("rows") and f.get("columns"):
            cand = {"id": f.get("format_id"), "width": f.get("width"), "height": f.get("height"),
                    "rows": f.get("rows"), "columns": f.get("columns"), "fps": f.get("fps") or 0,
                    "sheets": [{"url": fr.get("url"), "duration": fr.get("duration")} for fr in f["fragments"]]}
            if storyboard is None or (cand["height"] or 0) > (storyboard["height"] or 0):
                storyboard = cand
    info = entry_summary(data)
    info.update({
        "duration": dur,
        "storyboard": storyboard,
        "fps": data.get("fps"),
        "width": data.get("width"),
        "height": data.get("height"),
        "qualities": qlist,
        "audioBytesPerSec": int(audio_bps),
        "chapters": [{"title": c.get("title") or "", "start": c.get("start_time") or 0,
                      "end": c.get("end_time") or dur} for c in (data.get("chapters") or [])],
        "subs": sorted((data.get("subtitles") or {}).keys())[:30],
        "autoSubs": [k for k in ("pl", "en") if k in (data.get("automatic_captions") or {})],
        "date": data.get("upload_date"),
        "likes": data.get("like_count"),
        "description": (data.get("description") or "")[:600],
    })
    _info_cache[key] = (time.time(), info)
    return info


# ------------------------------------------------------------------ Resolve
def connect_resolve():
    global _resolve
    if _resolve is not None:
        try:
            if _resolve.GetProjectManager() is not None:
                return _resolve
        except Exception:
            pass
        _resolve = None
    if RESOLVE_MODULES not in sys.path:
        sys.path.append(RESOLVE_MODULES)
    try:
        import DaVinciResolveScript as drs  # noqa
        _resolve = drs.scriptapp("Resolve")
    except Exception as e:
        log("Resolve: brak połączenia: %s" % e)
        _resolve = None
    return _resolve


def _status_inner():
    """Wołane w procesie roboczym – tu wolno czekać na DaVinci."""
    r = connect_resolve()
    if r is None:
        return {"connected": False}
    pm = r.GetProjectManager()
    p = pm.GetCurrentProject() if pm else None
    tl = p.GetCurrentTimeline() if p else None
    return {
        "connected": True,
        "project": p.GetName() if p else None,
        "timeline": tl.GetName() if tl else None,
        "timecode": tl.GetCurrentTimecode() if tl else None,
        "fps": float(tl.GetSetting("timelineFrameRate") or 0) if tl else None,
        "videoTracks": tl.GetTrackCount("video") if tl else 0,
    }


def resolve_worker(conn):
    """Osobny proces do rozmów z DaVinci. API Resolve potrafi zablokować cały
    interpreter (np. gdy DaVinci wczytuje projekt) – tu nie zatrzyma silnika."""
    while True:
        try:
            op, payload = conn.recv()
        except (EOFError, OSError):
            return
        try:
            if op == "status":
                res = _status_inner()
            elif op == "import":
                payload.setdefault("log", [])
                where = import_to_resolve(payload)
                res = {"where": where, "log": payload.get("log", [])[-20:]}
            else:
                raise ValueError("unknown op")
            conn.send((True, res))
        except Exception as e:
            try:
                conn.send((False, str(e)))
            except Exception:
                return


class ResolveBridge:
    def __init__(self):
        self.lock = threading.Lock()
        self.proc = None
        self.conn = None

    def _ensure(self):
        if self.proc is None or not self.proc.is_alive():
            import multiprocessing as mpc
            ctx = mpc.get_context("spawn")
            a, b = ctx.Pipe()
            self.proc = ctx.Process(target=resolve_worker, args=(b,), daemon=True)
            self.proc.start()
            self.conn = a

    def _kill(self):
        try:
            self.proc.kill()
        except Exception:
            pass
        self.proc = None

    def call(self, op, payload, timeout, wait_lock=True):
        if not self.lock.acquire(timeout=-1 if wait_lock else 0.2):
            raise BlockingIOError("busy")
        try:
            self._ensure()
            self.conn.send((op, payload))
            if not self.conn.poll(timeout):
                self._kill()
                raise TimeoutError("DaVinci nie odpowiada")
            ok, res = self.conn.recv()
            if not ok:
                raise RuntimeError(res)
            return res
        finally:
            self.lock.release()


BRIDGE = ResolveBridge()


def resolve_status(force=False):
    now = time.time()
    cached = _status_cache["data"]
    if not force and cached and now - _status_cache["t"] < 2.0:
        return cached
    try:
        out = BRIDGE.call("status", None, 3.0, wait_lock=False)
    except BlockingIOError:
        # trwa import – podaj ostatni znany stan
        return dict(cached or {"connected": True}, busy=True)
    except TimeoutError:
        out = dict(cached or {"connected": True}, busy=True, message="DaVinci jest zajęty")
    except Exception as e:
        out = {"connected": False, "message": str(e)}
    _status_cache.update(t=now, data=out)
    return out


def sub_bin(mp, parent, name):
    for f in parent.GetSubFolderList() or []:
        if f.GetName() == name:
            return f
    return mp.AddSubFolder(parent, name)


def tc_to_frame(tc, fps):
    parts = (tc or "").replace(";", ":").split(":")
    if len(parts) != 4:
        return None
    hh, mm, ss, ff = (int(x) for x in parts)
    return (hh * 3600 + mm * 60 + ss) * round(fps) + ff


def track_free(tl, kind, idx, a, b):
    for it in tl.GetItemListInTrack(kind, idx) or []:
        try:
            s, e = it.GetStart(), it.GetEnd()
        except Exception:
            continue
        if s < b and e > a:
            return False
    return True


def pick_track(tl, kind, a, b, minimum=2):
    n = tl.GetTrackCount(kind)
    for i in range(minimum, n + 1):
        if track_free(tl, kind, i, a, b):
            return i
    target = max(n + 1, minimum)
    while tl.GetTrackCount(kind) < target:
        ok = tl.AddTrack(kind, "stereo") if kind == "audio" else tl.AddTrack(kind)
        if not ok:
            break
    return min(target, tl.GetTrackCount(kind))


def import_to_resolve(job):
    """Importuje pliki zadania do binu TDE Clip/<tytuł>, dodaje markery,
    źródło w metadanych i opcjonalnie układa na timeline. Zwraca opis."""
    o = job["opts"]
    pieces = job.get("pieces") or []
    with _resolve_lock:
        r = connect_resolve()
        if r is None:
            raise RuntimeError("DaVinci nie odpowiada – pliki są na dysku, zaimportuj je później.")
        pm = r.GetProjectManager()
        project = pm.GetCurrentProject() if pm else None
        if project is None:
            raise RuntimeError("W DaVinci nie ma otwartego projektu.")
        mp = project.GetMediaPool()
        root = mp.GetRootFolder()
        parent = sub_bin(mp, root, PARENT_BIN)
        bin_name = safe_name(o.get("bin") or job["title"], 60)
        target = sub_bin(mp, parent, bin_name)
        mp.SetCurrentFolder(target)
        existing = {}
        for c in target.GetClipList() or []:
            try:
                existing[c.GetClipProperty("File Path")] = c
            except Exception:
                pass
        clips = []
        for pc in pieces:
            clip = existing.get(pc["file"])
            if clip is None:
                got = mp.ImportMedia([pc["file"]])
                if not got:
                    raise RuntimeError("DaVinci nie przyjął pliku %s" % os.path.basename(pc["file"]))
                clip = got[0]
            clips.append((pc, clip))
            try:
                if o.get("credits", True):
                    clip.SetMetadata({
                        "Comments": "Źródło: %s\nKanał: %s" % (job["url"], job.get("channel") or ""),
                        "Description": job["title"],
                    })
            except Exception:
                pass
            if o.get("markers", True) and pc.get("chapters"):
                try:
                    fps = float(clip.GetClipProperty("FPS") or 25)
                    for ch in pc["chapters"]:
                        clip.AddMarker(int(round(ch["at"] * fps)), "Blue", ch["title"][:60] or "Rozdział",
                                       "Rozdział z YouTube", 1)
                except Exception as e:
                    jlog(job, "Markery: %s" % e)
        for sf in job.get("subFiles") or []:
            try:
                if sf not in existing:
                    mp.ImportMedia([sf])
            except Exception:
                pass
        try:
            mp.SetSelectedClip(clips[0][1]) if clips else None
        except Exception:
            pass
        where = "bin „%s / %s”" % (PARENT_BIN, bin_name)
        mode = o.get("timeline", "none")
        if mode == "none" or not clips:
            return "W Media Poolu: " + where
        return where + ", " + place_on_timeline(job, project, mp, clips)


def clip_fps(clip):
    try:
        return float(clip.GetClipProperty("FPS") or 0) or 25.0
    except Exception:
        return 25.0


def clip_frames(clip):
    try:
        n = int(float(clip.GetClipProperty("Frames") or 0))
        if n:
            return n
        # pliki audio nie mają „Frames” – liczymy z „Duration” (timecode w FPS klipu)
        f = tc_to_frame(clip.GetClipProperty("Duration") or "", clip_fps(clip))
        return int(f or 0)
    except Exception:
        return 0


def place_on_timeline(job, project, mp, clips):
    o = job["opts"]
    audio_only = o.get("mode") == "audio"
    if o.get("timeline") == "new":
        name = safe_name("%s – TDE Clip" % job["title"], 70)
        tl = mp.CreateEmptyTimeline(name)
        if not tl:
            name = "%s %s" % (name, time.strftime("%H%M%S"))
            tl = mp.CreateEmptyTimeline(name)
        if not tl:
            return "nie udało się utworzyć timeline"
        project.SetCurrentTimeline(tl)
        infos = []
        for pc, clip in clips:
            fr = clip_frames(clip)
            fps = clip_fps(clip)
            a = int(round(pc.get("handleIn", 0) * fps))
            b = fr - int(round(pc.get("handleOut", 0) * fps))
            info = {"mediaPoolItem": clip}
            if fr and b > a:
                info.update(startFrame=a, endFrame=b)
            infos.append(info)
        ok = mp.AppendToTimeline(infos)
        return "nowa timeline „%s”" % name if ok else "timeline „%s” (klipy się nie dodały)" % name

    target = job.get("target") or {}
    tl = None
    if target.get("timeline"):
        for i in range(1, (project.GetTimelineCount() or 0) + 1):
            cand = project.GetTimelineByIndex(i)
            if cand and cand.GetName() == target["timeline"]:
                tl = cand
                break
    cur = project.GetCurrentTimeline()
    if tl is None:
        tl = cur
    if tl is None:
        return "brak otwartej timeline – zostały w binie"
    if cur is None or cur.GetName() != tl.GetName():
        project.SetCurrentTimeline(tl)   # AppendToTimeline działa tylko na bieżącej timeline
    tfps = float(tl.GetSetting("timelineFrameRate") or 25)
    tc = target.get("timecode") if target.get("timeline") == tl.GetName() and target.get("timecode") else tl.GetCurrentTimecode()
    start = tc_to_frame(tc, tfps)
    if start is None:
        start = int(tl.GetStartFrame() or 0)
    # długość całej sekwencji (bez zapasów), żeby znaleźć wolną ścieżkę
    plan = []
    pos = start
    for pc, clip in clips:
        fr = clip_frames(clip)
        fps = clip_fps(clip)
        a = int(round(pc.get("handleIn", 0) * fps))
        b = (fr - int(round(pc.get("handleOut", 0) * fps))) if fr else 0
        length_src = (b - a) if fr and b > a else fr
        length_tl = max(1, int(round(length_src / fps * tfps)))
        plan.append((pc, clip, a, b, pos))
        pos += length_tl
    end = pos
    has_audio = o.get("mode") in ("av", "audio")
    vtrack = None if audio_only else pick_track(tl, "video", start, end, minimum=1)
    atrack = pick_track(tl, "audio", start, end, minimum=1) if has_audio else None
    placed = 0
    rec = start
    for pc, clip, a, b, _planned in plan:
        base = {"mediaPoolItem": clip, "recordFrame": rec}
        if b > a:
            base.update(startFrame=a, endFrame=b)
        next_rec = None
        if vtrack:
            got = mp.AppendToTimeline([dict(base, trackIndex=vtrack, mediaType=1)])
            if got:
                placed += 1
                try:
                    next_rec = got[0].GetEnd()
                except Exception:
                    pass
        if atrack:
            got = mp.AppendToTimeline([dict(base, trackIndex=atrack, mediaType=2)])
            if got and audio_only:
                placed += 1
            if got and next_rec is None:
                try:
                    next_rec = got[0].GetEnd()
                except Exception:
                    pass
        rec = next_rec if next_rec is not None else rec + max(1, int(round(((b - a) if b > a else clip_frames(clip)) / clip_fps(clip) * tfps)))
    tracks = []
    if vtrack:
        tracks.append("V%d" % vtrack)
    if atrack:
        tracks.append("A%d" % atrack)
    if not placed:
        return "nie udało się wstawić na timeline"
    return "na timeline „%s” (%s) od %s" % (tl.GetName(), "/".join(tracks), tc)


# ------------------------------------------------------------------ download
def run(job, cmd, on_line):
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, bufsize=1, encoding="utf-8", errors="replace", **GROUP)
    except OSError as e:
        jlog(job, "Nie mogę uruchomić: %s" % e)
        return -1
    PROCS[job["id"]] = p
    for line in p.stdout:
        on_line(line.rstrip())
    p.wait()
    PROCS.pop(job["id"], None)
    return p.returncode


def kill_tree(p):
    """Zatrzymuje proces razem z dziećmi (ffmpeg pobierający fragment dla yt-dlp).
    Samo terminate() zostawiało ffmpeg, który dalej pisał do pliku."""
    if p is None:
        return
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True, timeout=15, **NOWIN)
        else:
            import signal
            os.killpg(p.pid, signal.SIGTERM)
            try:
                p.wait(4)
            except subprocess.TimeoutExpired:
                pass
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    except ProcessLookupError:
        pass
    except Exception:
        try:
            p.kill()
        except Exception:
            pass


_names_lock = threading.Lock()
_names_taken = set()


def unique_stem(folder, stem):
    """Każde zadanie pisze do własnych plików. Wcześniej drugie pobranie tego samego
    fragmentu brało cudzy (niedokończony) plik za gotowy, bo yt-dlp pomija istniejące."""
    with _names_lock:
        try:
            names = os.listdir(folder)
        except OSError:
            names = []
        cand, n = stem, 1
        while os.path.join(folder, cand) in _names_taken or any(f.startswith(cand + ".") for f in names):
            n += 1
            cand = "%s (%d)" % (stem, n)
        _names_taken.add(os.path.join(folder, cand))
        return cand


def drop_partial(folder, stem):
    """Po anulowaniu usuwa niedokończone pliki tego zadania."""
    try:
        for f in os.listdir(folder):
            if f.startswith(stem + "."):
                try:
                    os.remove(os.path.join(folder, f))
                except OSError:
                    pass
    except OSError:
        pass


def format_selector(o):
    mode = o.get("mode", "av")
    q = str(o.get("quality") or "best")
    h = "" if q in ("best", "") else "[height<=%s]" % re.sub(r"\D", "", q)
    if mode == "audio":
        return "ba[ext=m4a]/ba/b"
    if mode == "video":
        return "bv*%s[vcodec^=avc1]/bv*%s/bv*" % (h, h)
    return "bv*%s[vcodec^=avc1]+ba[ext=m4a]/bv*%s+ba/b%s/bv*+ba/b" % (h, h, h)


def ytdlp_base(job, settings):
    cmd = [YTDLP, "--newline", "--no-warnings", "--no-playlist", "--no-part", "--force-overwrites",
           "--progress-template", "download:TDEP|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
           "--print", "after_move:FILE|%(filepath)s"]
    if FFMPEG:
        cmd += ["--ffmpeg-location", os.path.dirname(FFMPEG)]
    cmd += cookie_args(settings)
    cmd += ["-f", format_selector(job["opts"])]
    if job["opts"].get("mode") != "audio":
        cmd += ["--merge-output-format", "mp4"]
    return cmd


def sections_faster(dur, sel, quality):
    """Czy ciągnąć z YouTube sam fragment (ffmpeg). YouTube dławi takie ciągłe połączenie do
    ~1–2× tempa odtwarzania (zmierzone 0,2–0,4 MB/s), całość idzie zwykle 15–30 MB/s, a cięcie
    lokalne ~12× szybciej niż czas fragmentu. Fragment wygrywa tylko przy krótkim wycinku
    z bardzo długiego filmu (np. minuta z trzygodzinnego podcastu)."""
    if not dur or sel <= 0:
        return False
    h = int(re.sub(r"\D", "", str(quality or "")) or 1080)
    bps = 2.0e6 if h >= 2160 else 0.9e6 if h >= 1440 else 0.35e6 if h >= 1080 else 0.2e6
    cut_speed = 4.0 if h >= 2160 else 12.0
    full_s = dur * bps / 15e6 + sel / cut_speed
    section_s = sel / 1.0   # zmierzone 0,7–1,9× czasu fragmentu – liczymy ostrożnie
    return section_s < full_s


def make_line_handler(job, files, base_pct, span_pct, sec_len=0):
    st = {"pass": 0, "last": 0.0, "t0": time.time(), "size": 0}

    def set_progress(v):
        v = min(99, v)
        if v > (job.get("progress") or 0):
            upd(job, progress=v)

    def handle(line):
        # postęp ffmpeg (-progress pipe:1) przy pobieraniu fragmentu
        if sec_len and re.match(r"^[a-z_0-9]+=", line):
            k, v = line.split("=", 1)
            if k == "out_time" and v[:1].isdigit():
                hh, mm, ss = v.split(":")
                t = int(hh) * 3600 + int(mm) * 60 + float(ss)
                frac = max(0.0, min(1.0, t / sec_len))
                set_progress(base_pct + span_pct * frac)
                el = time.time() - st["t0"]
                if frac > 0.02 and el > 2:
                    left = el * (1 - frac) / frac
                    mb = st["size"] / 1048576.0 / el
                    upd(job, speed=("%.1f MB/s" % mb).replace(".", ",") if mb else "",
                        eta="%d:%02d" % (left // 60, left % 60))
            elif k == "total_size" and v.isdigit():
                st["size"] = int(v)
            return
        if line.startswith("TDEP|"):
            parts = line.split("|")
            try:
                pct = float(re.sub(r"[^\d.]", "", parts[1]) or 0)
                # obraz i dźwięk idą osobno (dwa razy 0→100 %): obraz to ~90 % całości
                if pct + 30 < st["last"]:
                    st["pass"] += 1
                st["last"] = pct
                frac = 0.9 * pct / 100.0 if st["pass"] == 0 else 0.9 + 0.1 * pct / 100.0
                set_progress(base_pct + span_pct * frac)
            except (ValueError, IndexError):
                pass
            speed = parts[2].strip() if len(parts) > 2 else ""
            eta = parts[3].strip() if len(parts) > 3 else ""
            if speed and "N/A" not in speed and "Unknown" not in speed:
                upd(job, speed=speed, eta=eta if ("N/A" not in eta and "Unknown" not in eta) else "")
            return
        if line.startswith("FILE|"):
            files.append(line.split("|", 1)[1])
            return
        m = re.search(r"time=(\d+):(\d+):([\d.]+)", line)
        if m:
            return
        jlog(job, line)
    return handle


def ffprobe_info(path):
    if not FFPROBE:
        return {}
    try:
        r = subprocess.run([FFPROBE, "-v", "error", "-show_entries",
                            "stream=codec_type,codec_name:format=duration", "-of", "json", path],
                           capture_output=True, text=True, timeout=30, **NOWIN)
        d = json.loads(r.stdout or "{}")
        v = [s.get("codec_name") for s in d.get("streams", []) if s.get("codec_type") == "video"]
        a = [s.get("codec_name") for s in d.get("streams", []) if s.get("codec_type") == "audio"]
        return {"vcodec": v[0] if v else None, "acodec": a[0] if a else None,
                "duration": float((d.get("format") or {}).get("duration") or 0)}
    except Exception:
        return {}


def has_encoder(name):
    if not FFMPEG:
        return False
    if not hasattr(has_encoder, "cache"):
        try:
            r = subprocess.run([FFMPEG, "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=20, **NOWIN)
            has_encoder.cache = r.stdout
        except Exception:
            has_encoder.cache = ""
    return (" %s " % name) in has_encoder.cache


def convert(job, src, o, start=None, end=None, step_base=0, step_span=0):
    """Konwersja (i opcjonalnie cięcie) do formatu montażowego.
    Zwraca ścieżkę wyniku (albo src, gdy nic nie trzeba robić)."""
    fmt = o.get("format", "original")
    mode = o.get("mode", "av")
    probe = ffprobe_info(src)
    base, ext = os.path.splitext(src)
    vargs, aargs, out_ext, tag = [], [], ext, ""
    if mode == "audio":
        af = o.get("audioFormat", "wav")
        if af == "wav":
            aargs, out_ext = ["-vn", "-c:a", "pcm_s24le", "-ar", "48000"], ".wav"
        elif af == "mp3":
            aargs, out_ext = ["-vn", "-c:a", "libmp3lame", "-q:a", "0"], ".mp3"
        else:
            aargs, out_ext = (["-vn", "-c:a", "copy"] if probe.get("acodec") == "aac" else
                              ["-vn", "-c:a", "aac", "-b:a", "320k"]), ".m4a"
        if out_ext == ext and start is None and "copy" in aargs:
            return src
    else:
        audio = ["-an"] if mode == "video" else ["-c:a", "pcm_s24le", "-ar", "48000"]
        if fmt == "prores":
            enc = "prores_videotoolbox" if has_encoder("prores_videotoolbox") else "prores_ks"
            vargs = ["-c:v", enc, "-profile:v", "3" if enc == "prores_ks" else "hq",
                     "-pix_fmt", "yuv422p10le" if enc == "prores_ks" else "p210le"] + audio
            out_ext, tag = ".mov", " ProRes"
        elif fmt == "dnxhr":
            vargs = ["-c:v", "dnxhd", "-profile:v", "dnxhr_hq", "-pix_fmt", "yuv422p"] + audio
            out_ext, tag = ".mov", " DNxHR"
        else:
            ok_codec = probe.get("vcodec") in ("h264", "hevc", "prores")
            if ok_codec and start is None:
                return src
            if ok_codec and start is not None:
                # precyzyjne cięcie i tak wymaga przekodowania - zostańmy przy H.264
                pass
            enc = "h264_videotoolbox" if has_encoder("h264_videotoolbox") else "libx264"
            vargs = (["-c:v", enc, "-q:v", "70", "-pix_fmt", "yuv420p"] if enc == "h264_videotoolbox"
                     else ["-c:v", "libx264", "-crf", "16", "-preset", "fast", "-pix_fmt", "yuv420p"])
            vargs += (["-an"] if mode == "video" else ["-c:a", "aac", "-b:a", "320k"])
            vargs += ["-movflags", "+faststart"]
            out_ext, tag = ".mp4", "" if start is not None else " H264"
    out = base + tag + out_ext
    if out == src:
        out = base + " (1)" + out_ext
    cmd = [FFMPEG, "-y", "-hide_banner", "-nostdin"]
    if start is not None:
        cmd += ["-ss", "%.3f" % start, "-to", "%.3f" % end]
    cmd += ["-i", src] + (vargs or []) + (aargs or []) + ["-map_metadata", "0", out]
    total = (end - start) if start is not None else (probe.get("duration") or 0)
    jlog(job, "ffmpeg → %s" % os.path.basename(out))

    def on_line(line):
        m = re.search(r"time=(\d+):(\d+):([\d.]+)", line)
        if m and total:
            t = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
            upd(job, progress=min(99, step_base + step_span * min(1.0, t / total)))
        elif line and not line.startswith(("frame=", "size=")) and "Stream mapping" not in line:
            pass
    code = run(job, cmd, on_line)
    if code == 0 and os.path.isfile(out) and os.path.getsize(out) > 0:
        if src != out and start is None:
            try:
                os.remove(src)
            except OSError:
                pass
        return out
    jlog(job, "ffmpeg nie dał rady (kod %s)" % code)
    return None


def srt_slice(src, dst, a, b):
    """Wycina z SRT napisy z zakresu [a, b] i przesuwa je do zera."""
    def parse(ts):
        h, m, rest = ts.strip().split(":")
        s, ms = rest.replace(".", ",").split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    def fmt(t):
        t = max(0.0, t)
        ms = int(round(t * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return "%02d:%02d:%02d,%03d" % (h, m, s, ms)
    with open(src, encoding="utf-8", errors="replace") as f:
        blocks = re.split(r"\n\s*\n", f.read().replace("\r", ""))
    out, n = [], 0
    for blk in blocks:
        lines = [l for l in blk.strip().split("\n") if l.strip() != ""]
        idx = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if idx is None:
            continue
        s, e = lines[idx].split("-->")
        s, e = parse(s), parse(e.split()[0])
        if e <= a or s >= b:
            continue
        n += 1
        out.append("%d\n%s --> %s\n%s" % (n, fmt(max(s, a) - a), fmt(min(e, b) - a),
                                          "\n".join(lines[idx + 1:])))
    with open(dst, "w", encoding="utf-8") as f:
        f.write("\n\n".join(out) + "\n")


def download_subs(job, folder, stem, settings):
    langs = "pl,en"
    cmd = [YTDLP, "--no-warnings", "--no-playlist", "--skip-download", "--write-subs", "--write-auto-subs",
           "--sub-langs", langs, "--convert-subs", "srt", "-o", os.path.join(folder, stem + ".%(ext)s")]
    if FFMPEG:
        cmd += ["--ffmpeg-location", os.path.dirname(FFMPEG)]
    cmd += cookie_args(settings) + [job["url"]]
    run(job, cmd, lambda l: jlog(job, l))
    found = []
    for name in sorted(os.listdir(folder)):
        if name.startswith(stem) and name.endswith(".srt"):
            found.append(os.path.join(folder, name))
    return found


def job_worker(job):
    with _slots:
        if job.get("status") == "canceled":
            return
        try:
            process_job(job)
        except Exception as e:
            log("Zadanie %s: %s\n%s" % (job["id"], e, traceback.format_exc()))
            upd(job, status="error", stage=str(e)[:300])
        save_jobs()


def process_job(job):
    settings = load_settings()
    o = job["opts"]
    if not YTDLP:
        upd(job, status="error", stage="Brak yt-dlp (w Terminalu: brew install yt-dlp)")
        return
    title = safe_name(job["title"], 80)
    folder = os.path.join(o.get("folder") or settings["folder"], safe_name("%s [%s]" % (title, job.get("vid") or job["id"]), 110))
    os.makedirs(folder, exist_ok=True)
    upd(job, folder=folder, status="downloading", stage="Łączę z YouTube…", progress=1)
    dur = float(job.get("duration") or 0)
    handles = float(o.get("handles") or 0)
    ranges = job.get("ranges") or []
    pieces = []
    chapters = job.get("chapters") or []
    count = max(1, len(ranges))
    # udział etapów w pasku postępu
    dl_share = 75.0 if (o.get("format") in ("prores", "dnxhr") or o.get("mode") == "audio") else 92.0

    def chapters_in(a, b):
        res = []
        for c in chapters:
            if a <= c["start"] < b:
                res.append({"at": c["start"] - a, "title": c.get("title") or ""})
        return res

    full_file = None
    if not ranges:
        stem = unique_stem(folder, title)
        tmpl = os.path.join(folder, stem.replace("%", "%%") + ".%(ext)s")
        files = []
        cmd = ytdlp_base(job, settings) + ["-o", tmpl, job["url"]]
        upd(job, stage="Pobieram cały film…")
        code = run(job, cmd, make_line_handler(job, files, 1, dl_share - 1))
        if code != 0 and job.get("status") != "canceled":
            jlog(job, "druga próba…")
            files.clear()
            time.sleep(1.5)
            code = run(job, cmd, make_line_handler(job, files, 1, dl_share - 1))
        if job.get("status") == "canceled":
            drop_partial(folder, stem)
            return
        if code != 0 or not files:
            raise RuntimeError(friendly_error("\n".join(job.get("log", [])[-6:])))
        upd(job, stage="Przygotowuję do montażu…", progress=dl_share, speed="", eta="")
        final = convert(job, files[-1], o, step_base=dl_share, step_span=99 - dl_share) or files[-1]
        pieces.append({"file": final, "start": 0, "end": dur, "handleIn": 0, "handleOut": 0,
                       "chapters": chapters_in(0, dur or 10 ** 9)})
    else:
        spans = []
        for rg in ranges:
            a0, b0 = float(rg["start"]), float(rg["end"])
            spans.append((a0, b0, max(0.0, a0 - handles), min(dur, b0 + handles) if dur else b0 + handles))
        sel = sum(b - a for _, _, a, b in spans)
        # Fragment przez ffmpeg YouTube dławi do tempa odtwarzania, a całość idzie ~50× szybciej –
        # zwykle lepiej pobrać całość i wyciąć lokalnie. Samo audio zawsze lokalnie (±2 s przy fragmentach).
        use_sections = o.get("mode") != "audio" and sections_faster(dur, sel, o.get("quality"))
        jlog(job, "sposób: %s (zaznaczone %.0f s z %.0f s)" % ("fragmenty z YouTube" if use_sections
                                                               else "całość + cięcie lokalne", sel, dur))
        full_end = 40.0   # do tylu % pasek idzie przy pobieraniu całości, reszta to cięcie
        for i, (a0, b0, a, b) in enumerate(spans):
            if job.get("status") == "canceled":
                return
            label = "%02d (%s–%s)" % (i + 1, tc_name(a0), tc_name(b0))
            stem = unique_stem(folder, "%s – %s" % (title, label))
            base_pct = 1 + (dl_share - 1) * i / count
            span = (dl_share - 1) / count
            files = []
            got = None
            if use_sections:
                upd(job, stage="Pobieram fragment %d z %d…" % (i + 1, count) if count > 1 else "Pobieram fragment…",
                    progress=base_pct)
                tmpl = os.path.join(folder, stem.replace("%", "%%") + ".%(ext)s")
                cmd = ytdlp_base(job, settings) + ["--download-sections", "*%.3f-%.3f" % (a, b),
                                                   "--force-keyframes-at-cuts",
                                                   "--downloader-args", "ffmpeg_o:-progress pipe:1 -nostats",
                                                   "-o", tmpl, job["url"]]
                for attempt in range(2):
                    files.clear()
                    code = run(job, cmd, make_line_handler(job, files, base_pct, span * 0.9, sec_len=b - a))
                    if job.get("status") == "canceled":
                        drop_partial(folder, stem)
                        return
                    if code == 0 and files and os.path.isfile(files[-1]):
                        got = files[-1]
                        break
                    jlog(job, "fragment nie wyszedł (kod %s)%s" % (code, ", druga próba…" if attempt == 0 else ""))
                    time.sleep(1.2)
            if got is None:
                # cały film (albo YouTube zablokował fragment, np. 403) + cięcie lokalne
                if full_file is None:
                    upd(job, stage="Pobieram ścieżkę dźwięku…" if o.get("mode") == "audio" else "Pobieram film…")
                    files = []
                    full_stem = unique_stem(folder, title + " (całość)")
                    tmpl = os.path.join(folder, full_stem.replace("%", "%%") + ".%(ext)s")
                    fb, fs = (1, full_end - 1) if not use_sections else (base_pct, span * 0.8)
                    code = run(job, ytdlp_base(job, settings) + ["-o", tmpl, job["url"]],
                               make_line_handler(job, files, fb, fs))
                    if job.get("status") == "canceled":
                        drop_partial(folder, full_stem)
                        return
                    if code != 0 or not files:
                        raise RuntimeError(friendly_error("\n".join(job.get("log", [])[-6:])))
                    full_file = files[-1]
                if use_sections:
                    cb, cs = base_pct + span * 0.8, span * 0.2
                else:
                    cb, cs = full_end + (99 - full_end) * i / count, (99 - full_end) / count
                upd(job, stage="Wycinam fragment %d z %d…" % (i + 1, count) if count > 1 else "Wycinam fragment…",
                    progress=cb, speed="", eta="")
                o_cut = dict(o)
                if o_cut.get("format") == "original":
                    o_cut["format"] = "h264cut"
                got = convert(job, full_file, o_cut, start=a, end=b, step_base=cb, step_span=cs)
                if not got:
                    raise RuntimeError("Nie udało się wyciąć fragmentu %d." % (i + 1))
                # nazwa jak przy zwykłym fragmencie
                nice = os.path.join(folder, stem + os.path.splitext(got)[1])
                try:
                    os.replace(got, nice)
                    got = nice
                except OSError:
                    pass
                final = got
            else:
                upd(job, stage="Przygotowuję fragment %d do montażu…" % (i + 1) if count > 1
                    else "Przygotowuję do montażu…", speed="", eta="")
                final = convert(job, got, o, step_base=base_pct + span * 0.9, step_span=span * 0.1) or got
            pieces.append({"file": final, "start": a, "end": b, "handleIn": a0 - a, "handleOut": b - b0,
                           "chapters": chapters_in(a, b)})
    sub_files = []
    if o.get("subs"):
        upd(job, stage="Pobieram napisy…", progress=max(job.get("progress", 0), 96))
        try:
            subs = download_subs(job, folder, title + " – napisy", settings)
            if ranges:
                for i, pc in enumerate(pieces):
                    for s in subs:
                        lang = s[:-4].rsplit(".", 1)[-1]
                        dst = os.path.join(folder, "%s.%s.srt" % (os.path.splitext(os.path.basename(pc["file"]))[0], lang))
                        srt_slice(s, dst, pc["start"], pc["end"])
                        sub_files.append(dst)
                for s in subs:
                    try:
                        os.remove(s)
                    except OSError:
                        pass
            else:
                sub_files = subs
        except Exception as e:
            jlog(job, "Napisy: %s" % e)
    if full_file and os.path.isfile(full_file):
        try:
            os.remove(full_file)
        except OSError:
            pass
    for i, pc in enumerate(pieces):
        if not os.path.isfile(pc["file"]):
            raise RuntimeError("Brak pliku fragmentu %d – spróbuj ponownie." % (i + 1))
        if FFPROBE and not ffprobe_info(pc["file"]).get("duration"):
            raise RuntimeError("Plik fragmentu %d wyszedł uszkodzony – spróbuj ponownie." % (i + 1))
    total = sum(os.path.getsize(p["file"]) for p in pieces if os.path.isfile(p["file"]))
    upd(job, pieces=pieces, subFiles=sub_files, files=[p["file"] for p in pieces], bytes=total,
        status="importing", stage="Wysyłam do DaVinci…", progress=99, speed="", eta="")
    do_import(job)


def do_import(job):
    if os.environ.get("TDE_CLIP_NO_RESOLVE"):
        upd(job, status="downloaded", stage="Pobrane (tryb testowy – bez importu)", progress=100, imported=False)
        save_jobs()
        return
    try:
        with _jobs_lock:
            payload = json.loads(json.dumps({k: v for k, v in job.items() if k != "log"}))
        res = BRIDGE.call("import", payload, 300)
        where = res["where"]
        for line in res.get("log") or []:
            jlog(job, line)
        upd(job, status="done", stage=where, progress=100, imported=True)
        log("Gotowe: %s → %s" % (job["title"], where))
    except Exception as e:
        upd(job, status="downloaded", stage=str(e), progress=100, imported=False)
        log("Import nie wyszedł: %s" % e)
        jlog(job, "Resolve: %s" % e)
    save_jobs()


def new_job(data):
    url = (data.get("url") or "").strip()
    if not url:
        raise ValueError("Brak linku do filmu")
    settings = load_settings()
    opts = {k: data.get("opts", {}).get(k, settings.get(k)) for k in DEFAULTS}
    opts["bin"] = (data.get("opts") or {}).get("bin") or ""
    ranges = []
    for r in data.get("ranges") or []:
        try:
            a, b = float(r["start"]), float(r["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if b - a >= 0.2:
            ranges.append({"start": round(a, 3), "end": round(b, 3)})
    vid = youtube_id(url)
    job = {
        "id": "%d%04d" % (int(time.time() * 1000) % 10 ** 9, len(JOBS) % 10000),
        "vid": vid,
        "url": url if not vid else "https://www.youtube.com/watch?v=%s" % vid,
        "title": data.get("title") or url,
        "channel": data.get("channel") or "",
        "thumb": data.get("thumb") or ("https://i.ytimg.com/vi/%s/mqdefault.jpg" % vid if vid else ""),
        "duration": data.get("duration") or 0,
        "chapters": data.get("chapters") or [],
        "ranges": ranges,
        "opts": opts,
        "status": "queued",
        "stage": "W kolejce",
        "progress": 0,
        "created": time.time(),
        "updated": time.time(),
        "source": data.get("source") or "app",
        "log": [],
    }
    if opts.get("timeline") == "playhead":
        st = resolve_status(force=True)
        if st.get("connected"):
            job["target"] = {"project": st.get("project"), "timeline": st.get("timeline"), "timecode": st.get("timecode")}
    with _jobs_lock:
        JOBS.append(job)
    save_settings({k: v for k, v in opts.items() if k in DEFAULTS and k not in ("folder", "cookies", "results")})
    threading.Thread(target=job_worker, args=(job,), daemon=True).start()
    return job


def cancel_job(jid):
    job = get_job(jid)
    if not job:
        return False
    if job["status"] in ("done", "downloaded", "error", "canceled"):
        return False
    upd(job, status="canceled", stage="Anulowano")
    p = PROCS.get(jid)
    if p:
        threading.Thread(target=kill_tree, args=(p,), daemon=True).start()
    save_jobs()
    return True


def public_job(j, with_log=False):
    d = {k: v for k, v in j.items() if k not in ("log", "pieces", "chapters")}
    d["count"] = len(j.get("ranges") or []) or 1
    if with_log:
        d["log"] = j.get("log", [])[-80:]
    return d


# ------------------------------------------------------------------ HTTP
ALLOWED_ORIGIN = re.compile(r"^(chrome-extension://[a-p]{32}|http://(127\.0\.0\.1|localhost)(:\d+)?" +
                            (r"|https://www\.youtube\.com" if os.environ.get("TDE_CLIP_DEV") else "") + r")$")
EXT_DIR = os.path.join(ROOT, "extension")
MIME = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
        ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon"}


class Handler(BaseHTTPRequestHandler):
    server_version = "TDEClip/" + VERSION

    def log_message(self, fmt, *args):
        pass

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin and ALLOWED_ORIGIN.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-TDE-Clip")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _file(self, base, rel):
        path = os.path.normpath(os.path.join(base, rel))
        if not path.startswith(base) or not os.path.isfile(path):
            return self.send_error(404)
        size = os.path.getsize(path)
        rng = re.match(r"bytes=(\d+)-(\d*)", self.headers.get("Range") or "")
        if rng and path.endswith((".mp4", ".mov", ".m4a", ".wav")):
            a = int(rng.group(1))
            b = min(size - 1, int(rng.group(2)) if rng.group(2) else a + 4 * 1024 * 1024)
            with open(path, "rb") as f:
                f.seek(a)
                chunk = f.read(b - a + 1)
            self.send_response(206)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", "bytes %d-%d/%d" % (a, b, size))
            self.send_header("Content-Length", str(len(chunk)))
            self.end_headers()
            self.wfile.write(chunk)
            return
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        if path.endswith((".mp4", ".mov")):
            self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", MIME.get(os.path.splitext(path)[1], "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        p = u.path
        try:
            if p in ("/", "/app"):
                self.send_response(302)
                self.send_header("Location", "/app/")
                return self.end_headers()
            if p.startswith("/app/"):
                rel = p[len("/app/"):] or "index.html"
                return self._file(APP_DIR, urllib.parse.unquote(rel))
            if p.startswith("/ui/"):
                return self._file(UI_DIR, urllib.parse.unquote(p[len("/ui/"):]))
            if p.startswith("/dev/") and os.environ.get("TDE_CLIP_DEV"):
                return self._file(os.path.join(ROOT, "dev"), urllib.parse.unquote(p[len("/dev/"):]))
            if p.startswith("/ext/") and os.environ.get("TDE_CLIP_DEV"):
                return self._file(EXT_DIR, urllib.parse.unquote(p[len("/ext/"):]))
            if p.startswith("/icons/"):
                return self._file(ICON_DIR, urllib.parse.unquote(p[len("/icons/"):]))
            if p == "/api/status":
                return self._json({"ok": True, "app": "TDE Clip", "version": VERSION, "pid": os.getpid(),
                                   "platform": "win" if IS_WIN else ("mac" if IS_MAC else "linux"), "updateHint": UPDATE_HINT,
                                   "ytdlp": bool(YTDLP), "ffmpeg": bool(FFMPEG),
                                   "resolve": resolve_status(force="force" in q)})
            if p == "/api/settings":
                return self._json(load_settings())
            if p == "/api/jobs":
                with _jobs_lock:
                    data = [public_job(j) for j in reversed(JOBS[-60:])]
                return self._json({"jobs": data})
            if p == "/api/job":
                j = get_job(q.get("id", [""])[0])
                return self._json(public_job(j, True) if j else {"error": "nie ma"}, 200 if j else 404)
            if p == "/api/search":
                s = load_settings()
                n = max(6, min(50, int(q.get("n", [s.get("results", 24)])[0])))
                return self._json(search(q.get("q", [""])[0], n, q.get("sort", ["relevance"])[0], s))
            if p == "/api/info":
                return self._json(video_info(q.get("url", [""])[0], load_settings()))
            self.send_error(404)
        except subprocess.TimeoutExpired:
            self._json({"error": "YouTube nie odpowiedział na czas – spróbuj jeszcze raz."}, 504)
        except Exception as e:
            log("GET %s: %s" % (p, e))
            self._json({"error": str(e)}, 500)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        p = u.path
        origin = self.headers.get("Origin")
        if origin and not ALLOWED_ORIGIN.match(origin):
            return self._json({"error": "forbidden"}, 403)
        if self.headers.get("X-TDE-Clip") != "1":
            return self._json({"error": "missing header"}, 403)
        try:
            d = self._body()
            if p == "/api/jobs":
                j = new_job(d)
                return self._json({"ok": True, "job": public_job(j)})
            if p == "/api/cancel":
                return self._json({"ok": cancel_job(d.get("id"))})
            if p == "/api/retry":
                j = get_job(d.get("id"))
                if not j:
                    return self._json({"error": "nie ma"}, 404)
                if j["status"] == "downloaded":
                    upd(j, status="importing", stage="Wysyłam do DaVinci…")
                    threading.Thread(target=do_import, args=(j,), daemon=True).start()
                else:
                    upd(j, status="queued", stage="W kolejce", progress=0, log=[])
                    threading.Thread(target=job_worker, args=(j,), daemon=True).start()
                return self._json({"ok": True})
            if p == "/api/reveal":
                j = get_job(d.get("id"))
                target = None
                if j:
                    files = [f for f in j.get("files") or [] if os.path.exists(f)]
                    target = files[0] if files else (j.get("folder") if j.get("folder") and os.path.isdir(j["folder"]) else None)
                if not target:
                    target = load_settings()["folder"]
                    os.makedirs(target, exist_ok=True)
                    open_path(target)
                else:
                    open_path(target, reveal=True)
                return self._json({"ok": True})
            if p == "/api/remove":
                with _jobs_lock:
                    JOBS[:] = [j for j in JOBS if j["id"] != d.get("id") or
                               j["status"] in ("queued", "downloading", "processing", "importing")]
                save_jobs()
                return self._json({"ok": True})
            if p == "/api/clear":
                with _jobs_lock:
                    JOBS[:] = [j for j in JOBS if j["status"] in ("queued", "downloading", "processing", "importing")]
                save_jobs()
                return self._json({"ok": True})
            if p == "/api/settings":
                return self._json(save_settings(d))
            if p == "/api/choose-folder":
                cur = load_settings()["folder"]
                os.makedirs(cur, exist_ok=True)
                path = choose_folder(cur)
                if path:
                    save_settings({"folder": path})
                    return self._json({"ok": True, "folder": path})
                return self._json({"ok": False, "folder": cur})
            if p == "/api/open":
                url = d.get("url") or ""
                if url.startswith("https://"):
                    open_url(url)
                return self._json({"ok": True})
            if p == "/api/shutdown":
                self._json({"ok": True})
                threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start()
                return
            self.send_error(404)
        except Exception as e:
            log("POST %s: %s\n%s" % (p, e, traceback.format_exc()))
            self._json({"error": str(e)}, 500)


def port_busy(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    if port_busy(PORT):
        print("TDE Clip już działa na porcie %d" % PORT)
        return
    load_jobs()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    srv.daemon_threads = True
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))
    log("TDE Clip %s: http://127.0.0.1:%d  (yt-dlp: %s, ffmpeg: %s, python: %s)" %
        (VERSION, PORT, YTDLP, FFMPEG, sys.executable))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            os.remove(PID_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    main()
