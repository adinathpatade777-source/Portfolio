# Portfolio
I specialize in end-to-end video production, transforming concepts into powerful visual stories. With expertise in shooting, editing, and post-production, I create content that not only looks great but also delivers results. My work blends creativity with strategy to produce videos that engage, inform, and inspire audiences.

## Comet Edit (hero reel)

`edit/` holds a code-generated edit in the style of vertical anime "aesthetic edits". Every scene is drawn in code, with no footage.

- Landscape shots turned 90° sideways to fill a 9:16 frame
- A hard cut on every beat (120 BPM, 24 shots, 12 s)
- A slow push-in and a decaying camera shake on each cut, plus white flash hits
- Bloom, a pink/violet halation tint, vignette and film grain
- An end card with your name

Files:
- `edit/comet-edit.js`: the engine (`new CometEdit(canvas, opts)`, `.play()`, `.renderFrame(t)`)
- `edit/index.html`: standalone player (`?title=NAME&sub=ROLE`)
- `edit/render.js`: export to MP4. Run `node edit/render.js out.mp4 --title "NAME" --music song.mp3` (needs Playwright and ffmpeg)
- `comet-edit.mp4`: the rendered 720×1280, 60 fps reel
