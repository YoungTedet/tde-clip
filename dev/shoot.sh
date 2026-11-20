#!/bin/zsh
# Zrzuty UI do oceny krytyka (Retina 2x). Wymaga serwera z TDE_CLIP_DEV=1.
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT=${1:-$(dirname $0)/shots}
mkdir -p $OUT
PROF=$(mktemp -d)
B=http://127.0.0.1:8770
shoot() {
  local P=$PROF/$1; mkdir -p $P
  "$CH" --headless=new --user-data-dir=$P --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=${3:-1440},${4:-900} --virtual-time-budget=${5:-9000} --autoplay-policy=no-user-gesture-required \
    --screenshot=$OUT/$1.png "$2" >/dev/null 2>&1
  echo "$OUT/$1.png"
}
shoot 01-yt-panel-dark      "$B/dev/yt.html?panel=1&t=63&ranges=9.6-14.2,58-64.5" 1440 900 &
shoot 02-yt-panel-light     "$B/dev/yt.html?panel=1&t=20&theme=light&ranges=9.6-14.2" 1440 900 &
shoot 03-yt-panel-more      "$B/dev/yt.html?panel=1&t=40&more=1&draft=32" 1440 1000 &
shoot 04-yt-button          "$B/dev/yt.html?t=20" 1440 900 &
wait
shoot 05-app-empty          "$B/app/?theme=dark" 1280 800 4000 &
shoot 06-app-results        "$B/app/?theme=dark&q=tony%20hawk%20900" 1280 800 &
shoot 07-app-detail         "$B/app/?theme=dark&v=4YYTNkAdDD8&ranges=9.6-14.2,58-64.5" 1280 800 &
shoot 08-app-downloads      "$B/app/?theme=dark&view=downloads" 1280 800 4000 &
wait
shoot 09-app-detail-light   "$B/app/?theme=light&v=4YYTNkAdDD8&ranges=9.6-14.2&more=1" 1280 800 &
shoot 10-app-settings       "$B/app/?theme=dark&settings=1" 1280 800 4000 &
shoot 11-yt-offline         "$B/dev/yt.html?panel=1&offline=1&t=5" 1440 900 5000 &
wait
rm -rf $PROF
