#!/Library/Frameworks/Python.framework/Versions/3.14/bin/python3
# TDE Clip – pomocnik dla Chrome (Native Messaging): na prośbę rozszerzenia
# uruchamia lokalny silnik, jeśli jeszcze nie działa. Nic więcej nie robi.
import json
import os
import socket
import struct
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PORT = 8770


def config():
    try:
        with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"root": ROOT, "python": sys.executable}


def read():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    n = struct.unpack("<I", raw)[0]
    return json.loads(sys.stdin.buffer.read(n).decode("utf-8") or "{}")


def write(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def up():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def main():
    msg = read() or {}
    if msg.get("cmd") not in ("start", "ping"):
        write({"ok": False, "error": "unknown command"})
        return
    if up():
        write({"ok": True, "running": True})
        return
    if msg.get("cmd") == "ping":
        write({"ok": True, "running": False})
        return
    cfg = config()
    root = cfg.get("root") or ROOT
    os.makedirs(os.path.join(root, "data"), exist_ok=True)
    log = open(os.path.join(root, "data", "server.log"), "a")
    env = dict(os.environ)
    py = cfg.get("python") or sys.executable
    if os.name == "nt":
        if py.lower().endswith("python.exe") and os.path.isfile(py[:-10] + "pythonw.exe"):
            py = py[:-10] + "pythonw.exe"
        extra = {"creationflags": 0x00000008 | 0x00000200 | 0x08000000}
    else:
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        extra = {"start_new_session": True}
    subprocess.Popen([py, os.path.join(root, "server", "clip_server.py")],
                     cwd=os.path.join(root, "server"), stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                     env=env, **extra)
    for _ in range(40):
        time.sleep(0.2)
        if up():
            write({"ok": True, "started": True})
            return
    write({"ok": False, "error": "engine did not start"})


if __name__ == "__main__":
    main()
