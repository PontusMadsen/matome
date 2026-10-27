#!/bin/bash
# Launches the packaged arm64 app and fails unless it is still running after 15s and has created its database.
# Used by CI so a build that crashes at startup is never published.
APP="$(ls -d "$PWD"/release/mac-arm64/*.app | head -1)"
EXE="$APP/Contents/MacOS/$(ls "$APP/Contents/MacOS" | head -1)"
DATA="$HOME/Library/Application Support/Flax"
echo "app: $APP"
rm -rf "$DATA"
ELECTRON_ENABLE_LOGGING=1 "$EXE" --enable-logging=stderr > "${RUNNER_TEMP:-/tmp}/app.out" 2>&1 &
PID=$!
sleep 15
if ! kill -0 $PID 2>/dev/null; then
  wait $PID; echo "FAIL: app exited early (code $?)"; tail -40 "${RUNNER_TEMP:-/tmp}/app.out"; ls -la "$DATA" 2>&1 | head -20; exit 1
fi
kill $PID
if [ ! -f "$DATA/cache.db" ]; then echo "FAIL: app ran but never created cache.db"; ls -la "$DATA"; exit 1; fi
echo "OK: app started and created its database"
