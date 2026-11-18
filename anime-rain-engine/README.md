# Anime Rain Engine

A rainy-day anime short drawn and animated **entirely in code**: no AI images, no
stock footage, no image slideshow. Every frame is painted with NumPy and OpenCV. The
scenes are drawn landscape and then turned sideways to fill a 9:16 phone screen, like
anime wallpaper edits.

## What moves

| Scene | Animation |
|---|---|
| **Puddle steps** | Sneaker walk cycle (heel lift → swing → heel strike), the puddle mirrors the park and the shoes, raindrop rings refract the reflection, the landing throws up a splash |
| **Rain pond** | Willow strands sway (more at the tips), rain ripples distort the reflection of a misty skyline, lily pads bob |
| **Window desk** | Seated boy with a 2-bone IK writing arm, ink appears where the pencil has been, he blinks and breathes, steam curls from the mug, drops slide down the window and refract the garden upside down |
| **Sun break** | Cumulus clouds lit from the sun's side drift apart, god rays fan out, maple leaves sway, drops grow on leaf tips and fall, the rain thins out |

Every shot also has three depth layers of rain, cel shading with rim light, bloom,
cool-shadow grading and film grain. Shots are joined with a whip pan or a dissolve.
The audio track is synthesized rain ambience (filtered noise), ducked under an optional
voice-over.

## Run

```bash
pip install -r requirements.txt          # needs ffmpeg on PATH
python3 render.py --preview              # contact sheet -> preview.jpg (about 10 s)
python3 render.py --out rain.mp4         # 9.7 s, 1080x1920, 30 fps (about 3-4 min on 2 cores)
python3 render.py --out rain.mp4 --voice voice.mp3 --captions examples_captions.json
python3 render.py --out rain_16x9.mp4 --upright   # keep the frame landscape 1920x1080
```

Captions are a JSON list of `{"text", "t0", "t1", "y", "size"}`. Set `--font` to any
.ttf/.otf file.

## Layout

```
engine/core.py    drawing primitives: anti-aliased local-mask fills/strokes, gradients,
                  fractal noise, transforms, bezier, variable-width limbs, bloom, grade, grain
engine/fx.py      Rain (3 layers), Ripples (displacement + crests + big events),
                  Splash particles, GlassDrops (refracting, sliding), god_rays
engine/rigs.py    sneaker + walk cycle, seated boy (IK arm, blink, breathing), maple leaf
engine/scenes.py  PuddleSteps, RainPond, WindowDesk, SunBreak  (static layers cached,
                  motion in frame(t))
engine/live.py    LivingImage (ripples, sway, wiggle, rack, 2.5D dolly), ClipSource
engine/post.py    wet anime grade + glow, grain, captions, audio mix with ducking
compose.py        compositor: clips + living images + code scenes -> styled Short
render.py         timeline, transitions, sideways framing, captions, ffmpeg + audio mix
```

Each scene's `frame(t)` depends only on `t`, so you can render any time range in
parallel. To add a scene, write a class with `dur` and `frame(t) -> float32 BGR
1920x1080`, then add it to `TIMELINE` in `render.py`.

## Compose mode: a real anime look from Google Vids clips and painted frames

Code-drawn art looks flat. For a film look, `compose.py` builds the Short from
real-looking sources and gives every shot the same rainy-anime style pass:

| Shot source | What happens |
|---|---|
| `"clip": "x.mp4"` (Google Vids / Veo, or any video) | trimmed (`in`, `dur`), `speed`-ramped, scaled to cover |
| `"image": "x.png"` (painted anime frame) | brought to life *inside* the frame: rain ripples refracting water, swaying foliage, a looping hand or foot, breathing, rack focus, and `dolly` = true 2.5D depth parallax (near things move more) |
| `"scene": "PuddleSteps"` | one of the code-drawn scenes above |

Style pass on every shot: 3-layer rain overlay (`rain` 0..1), optional refracting
window drops (`glass: true`), wet teal/emerald grade, soft glow, film grain. Shots are
joined by `cut`, `whip`, `fade` or `flash`. The film is turned sideways to 9:16
(`"orientation": "sideways"`) or kept `"landscape"`. The voice-over is delayed and mixed
over synthesized rain ambience, and the rain/music are ducked under it.

```bash
python3 compose.py example_project.json --preview      # contact sheet
python3 compose.py example_project.json --out short.mp4
```

**Depth model (for `dolly` and `rack`):** put MiDaS small in `models/`:
`curl -sSL -o models/midas_small.onnx https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx`
and `pip install onnxruntime`. Without it, depth falls back to "lower in frame = nearer".

**Google Vids workflow:** create a 16:9 video, upload each painted frame, animate it
with Veo (image-to-video) using a motion prompt (rain, ripples, hand writing, leaves
swaying, static camera), then download the clips and list them as `"clip"` shots.
Keep the clips landscape; the compositor turns the film sideways.

All characters, places and designs here are original.
