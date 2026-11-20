# TDE Clip – skrót w DaVinci: Workspace › Scripts › TDE Clip
# Uruchamia silnik (jeśli trzeba) i otwiera okno TDE Clip. macOS i Windows.
import glob
import json
import os
import socket
import subprocess
import sys
import time

ROOT = "__ROOT__"
PORT = 8770
IS_WIN = os.name == "nt"


def up():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def detached():
    if IS_WIN:
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
        return {"creationflags": 0x00000008 | 0x00000200 | 0x08000000}
    return {"start_new_session": True}


def electron():
    if IS_WIN:
        base = os.path.join(os.environ.get("PROGRAMFILES", r"C:\Program Files"), "Blackmagic Design", "DaVinci Resolve")
        hits = glob.glob(os.path.join(base, "**", "electron.exe"), recursive=True) + \
            glob.glob(os.path.join(base, "**", "Electron*.exe"), recursive=True)
        return hits[0] if hits else None
    p = "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Applications/.hidden/Electron.app/Contents/MacOS/Electron"
    return p if os.path.isfile(p) else None


def main():
    try:
        with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {"python": "pythonw" if IS_WIN else "/usr/bin/python3"}
    env = dict(os.environ)
    if not IS_WIN:
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    if not up():
        py = cfg.get("python")
        if IS_WIN and py.lower().endswith("python.exe") and os.path.isfile(py[:-10] + "pythonw.exe"):
            py = py[:-10] + "pythonw.exe"
        os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
        log = open(os.path.join(ROOT, "data", "server.log"), "a")
        subprocess.Popen([py, os.path.join(ROOT, "server", "clip_server.py")], cwd=os.path.join(ROOT, "server"),
                         stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=env, **detached())
        for _ in range(40):
            if up():
                break
            time.sleep(0.2)
    plugin = os.path.join(ROOT, "resolve", "com.tde.clip")
    exe = electron()
    url = "http://127.0.0.1:%d/app/" % PORT
    if exe:
        subprocess.Popen([exe, plugin], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, env=env, **detached())
    elif IS_WIN:
        # Edge jest w każdym Windowsie – okno aplikacji bez pasków przeglądarki
        subprocess.Popen('start "" msedge --app=%s' % url, shell=True, **detached())
    else:
        subprocess.Popen(["open", "-na", "Google Chrome", "--args", "--app=" + url])


main()
