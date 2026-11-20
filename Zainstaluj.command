#!/bin/zsh
# TDE Clip – instalator. Dwuklik w Finderze albo: ./Zainstaluj.command
# Bezpieczny do ponownego uruchomienia (np. po przeniesieniu folderu).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="klekmlpfnfmmafokghpohlkgfaeoklif"
MODULES="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules"
bold() { print -P "%B$1%b"; }
ok() { print -P "  %F{green}✓%f $1"; }
warn() { print -P "  %F{yellow}!%f $1"; }

bold "TDE Clip – instalacja"
echo "Folder: $ROOT"
echo

# 1. Python, który widzi API DaVinci
PY=""
for c in /Library/Frameworks/Python.framework/Versions/3.14/bin/python3 /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
         /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  [ -x "$c" ] || continue
  if "$c" -c "import sys; sys.path.append('$MODULES'); import DaVinciResolveScript" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do [ -x "$c" ] && PY="$c" && break; done
  warn "Python nie widzi API DaVinci – import do Media Poola może nie działać ($PY)"
else
  ok "Python: $PY"
fi

# 2. yt-dlp i ffmpeg
for tool in yt-dlp ffmpeg; do
  if [ -x /opt/homebrew/bin/$tool ] || [ -x /usr/local/bin/$tool ] || command -v $tool >/dev/null 2>&1; then
    ok "$tool jest"
  else
    warn "brak $tool – zainstaluj w Terminalu: brew install $tool"
  fi
done

# 3. Konfiguracja
cat > "$ROOT/config.json" <<EOF
{ "root": "$ROOT", "python": "$PY" }
EOF
mkdir -p "$ROOT/data"
ok "config.json"

# 4. Pomocnik dla Chrome (Chrome sam uruchamia silnik)
HOST="$ROOT/native-host/tde_clip_host.py"
sed -i '' "1s|.*|#!$PY|" "$HOST"
chmod +x "$HOST"
for d in "$HOME/Library/Application Support/Google/Chrome" "$HOME/Library/Application Support/Google/Chrome Beta" \
         "$HOME/Library/Application Support/BraveSoftware/Brave-Browser" "$HOME/Library/Application Support/Arc/User Data"; do
  [ -d "$d" ] || continue
  mkdir -p "$d/NativeMessagingHosts"
  cat > "$d/NativeMessagingHosts/com.tde.clip.json" <<EOF
{
  "name": "com.tde.clip",
  "description": "TDE Clip – uruchamia lokalny silnik",
  "path": "$HOST",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
  case "$d" in *Brave*) n=Brave;; *Arc*) n=Arc;; *Beta*) n="Chrome Beta";; *) n=Chrome;; esac
  ok "pomocnik dla: $n"
done

# 5. Skrót w DaVinci: Workspace › Scripts › TDE Clip
UTIL="$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility"
mkdir -p "$UTIL"
sed "s|__ROOT__|$ROOT|" "$ROOT/resolve/TDE_Clip_launcher.py" > "$UTIL/TDE Clip.py"
ok "DaVinci: Workspace › Scripts › TDE Clip"

# 6. (opcjonalnie) Workspace › Workflow Integrations – wymaga hasła administratora
WI="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
echo
read "ans?Dodać TDE Clip także do menu Workspace › Workflow Integrations? Potrzebne hasło do Maca. [t/N] "
if [[ "$ans" == [tTyY]* ]]; then
  TMP=$(mktemp -d)
  cp -R "$ROOT/resolve/com.tde.clip" "$TMP/"
  cat > "$TMP/com.tde.clip/tdeclip.json" <<EOF
{ "root": "$ROOT", "python": "$PY" }
EOF
  sudo mkdir -p "$WI"
  sudo rm -rf "$WI/com.tde.clip"
  sudo cp -R "$TMP/com.tde.clip" "$WI/"
  rm -rf "$TMP"
  ok "Workflow Integrations (po restarcie DaVinci)"
fi

# 7. Start silnika
if ! curl -s -m 1 http://127.0.0.1:8770/api/status >/dev/null; then
  (cd "$ROOT/server" && PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" nohup "$PY" clip_server.py >> "$ROOT/data/server.log" 2>&1 &)
  sleep 1
fi
curl -s -m 2 http://127.0.0.1:8770/api/status >/dev/null && ok "silnik działa (127.0.0.1:8770)" || warn "silnik nie wystartował – zobacz data/server.log"

echo
bold "Ostatni krok – rozszerzenie w Chrome:"
echo "  1. Otwórz w Chrome adres  chrome://extensions"
echo "  2. Włącz „Tryb dewelopera” (prawy górny róg)"
echo "  3. Kliknij „Wczytaj rozpakowane” i wskaż folder:"
echo "     $ROOT/extension"
echo
[ -z "$TDE_CLIP_QUIET" ] && open -R "$ROOT/extension/manifest.json" 2>/dev/null || true
bold "Gotowe. Pod filmem na YouTube pojawi się przycisk DaVinci."
