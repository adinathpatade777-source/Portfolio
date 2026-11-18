#!/usr/bin/env bash
# One-click start. Installs the free voice package once, then runs the agent.
set -e
cd "$(dirname "$0")"
python3 -c "import edge_tts, gtts, numpy, requests" 2>/dev/null || pip install -q edge-tts gTTS numpy requests
python3 -u run.py "$@"
