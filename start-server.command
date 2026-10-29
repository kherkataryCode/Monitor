#!/bin/bash
# Optional local server for the Tender Monitoring Dashboard (listens on this computer only).
# macOS: double-click (first time: right-click > Open). Alternatively open index.html directly.
cd "$(dirname "$0")"
echo "Starting local server at http://127.0.0.1:8080/  (close this window or press Ctrl+C to stop)"
( sleep 1; open "http://127.0.0.1:8080/index.html" ) &
python3 -m http.server 8080 --bind 127.0.0.1
