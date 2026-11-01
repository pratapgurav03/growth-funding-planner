#!/bin/bash
# Double-click to start the planner with live SEC data, then open it in the browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Node is not installed. Get it from https://nodejs.org (version 18 or newer)."; read -r -p "Press Enter to close"; exit 1; fi
# Free the port if an old copy of the server is still running.
OLD=$(lsof -ti tcp:8787 2>/dev/null); [ -n "$OLD" ] && kill $OLD 2>/dev/null && sleep 1
(sleep 1.5; open "http://127.0.0.1:8787/web/") &
node server.js
echo; read -r -p "Server stopped. Press Enter to close"
