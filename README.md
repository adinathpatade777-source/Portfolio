# Portfolio
I specialize in end-to-end video production, transforming concepts into powerful visual stories. With expertise in shooting, editing, and post-production, I create content that not only looks great but also delivers results. My work blends creativity with strategy to produce videos that engage, inform, and inspire audiences.

## Story Studio (`story-studio/`)
A browser app that turns a script into an animated story video, with no API keys:
1. **Script → scenes** – paste a script; it is split into scenes and each gets a ready-made image prompt.
2. **Images from ChatGPT** – "Open in ChatGPT" pre-fills the prompt; drop/paste/bulk-upload the images ChatGPT makes.
3. **Voiceover** – generated in the browser by the open-source Kokoro TTS model (downloads once, then runs offline). You can also upload your own recording per scene.
4. **Animate** – Ken Burns zoom/pan, crossfades and subtitles, exported as MP4/WebM, or download a **Google Vids pack** (images, WAVs, timeline, how-to) to animate in vids.google.com.

Run it: `cd story-studio && python3 -m http.server` → open http://localhost:8000 (Chrome/Edge recommended).
