# Frame — free AI video studio (mobile)

A mobile-first web app (installable PWA) that turns text or a photo into a short photorealistic video,
using the open-source **LTX-Video** model on free Hugging Face GPUs. No signup, no server, no cost.

## Features
- Text → Video and Image → Video (animate a photo)
- 9:16 / 1:1 / 16:9 formats, 1–8 s clips
- "Look" presets (Cinematic, Drone, Golden hour, Macro…) and a photoreal prompt boost
- HD texture pass, negative prompt, prompt strength, seed control
- Live queue/progress, save & share (native share sheet on phones)
- On-device gallery (last 24 videos, stored in IndexedDB)
- Add to Home Screen to use it like a native app

## Run it
It's static files: open `video-studio/` from any static host (e.g. GitHub Pages:
`https://<user>.github.io/Portfolio/video-studio/`) or locally with `python3 -m http.server`.

## Free-tier limits
Generation runs on Hugging Face ZeroGPU. Anonymous visitors get a small daily GPU quota per IP.
Paste a free token from https://huggingface.co/settings/tokens under **Advanced** for more quota
(it is stored only in your browser).
