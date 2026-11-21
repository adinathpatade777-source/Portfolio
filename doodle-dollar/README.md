# Doodle Dollar: The Truck and the Jar

An animated money-explainer video (about 10.5 minutes, 1080p, 24 fps) made with Blender and synced to an AI-voice narration.
Two friends earn the same paycheck. One finances a $45,000 truck at $750 a month. The other buys a cheap used car with cash and invests the same $750 every month.

## Folders

| Folder | What's inside |
|---|---|
| `script/` | Full script, voiceover parts (narrator, TTS and salesman), narration story with the hook, narration with expression tags such as `<smile>`, and the timestamped transcript |
| `audio/` | Cleaned narration. The expression tags the TTS read aloud ("Serious.", "Shocked." and others) are silenced without changing the timing |
| `blender/` | Scripts that build and animate the scene, plus render scripts |
| `previews/` | Contact sheets of the flat doodle version and the 3D version |

## Two looks, one timeline

- **Flat doodle**: `build_flat.py` + `lib_flat.py`. Uses flat emission colours, ink outlines and an orthographic camera.
- **3D**: `build.py --3d` + `lib.py`. Has round characters with sphere heads, tube limbs, hands, shoes and domed hats. Cars get four thick wheels. Adds sun and fill lights, soft shadows, ambient occlusion, a curved studio backdrop, 3D text and an angled orbiting perspective camera.

Each scene is timed to word timestamps taken from the narration (`words.json`, made by faster-whisper via `transcribe.py`).
For smooth motion the animation uses BACK, SINE and BOUNCE easing, plus sine-wave idle motion and live dollar counters.

## Render

Needs Blender 4.0 with the Inter font installed at `/usr/share/fonts/opentype/inter/`.

```bash
cd blender
./render3d.sh        # 3D version   -> frames3d/f_####.jpg  (4 parallel workers)
./render_all.sh      # flat version -> frames/f_####.png

# a single test still:
blender -b --python build.py -- 1920 1080 2 1 15240 stills --3d --still 5600

# encode:
ffmpeg -framerate 24 -i frames3d/f_%04d.jpg -i ../audio/narration_clean.mp3 \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -tune animation -c:a aac -b:a 192k \
  -shortest -movflags +faststart truck_and_jar_3d.mp4
```

Script arguments: `-- RES_X RES_Y SAMPLES FRAME_START FRAME_END OUTDIR [--3d] [--save] [--still f1,f2,...]`.
Rendering skips frames that already exist, so you can stop and restart it.

The rendered MP4s (130 MB or more) are not in this repo because they exceed GitHub's 100 MB file limit.
