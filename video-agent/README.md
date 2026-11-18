# Video Agent

One command makes a finished faceless cartoon money-news video (the Paper Billions format:
one real story, one huge number, friendly cartoons, every line animated).

```
./run.sh                              # the agent finds this week's biggest money story
./run.sh --topic "Nvidia stock"       # your own topic
./run.sh --lang hi                    # Hindi narration and captions
./run.sh --seconds 480                # 8-minute video for a real channel
```

You don't need API keys. The agent is Claude Code running headless (`claude -p`) with the
login that is already on the machine. Every other tool is free and needs no account.

## Pipeline

| Stage | What happens | Tool |
|---|---|---|
| 1. Research | Pulls the last 7 days of Google News headlines, picks the story with the biggest number, verifies it in 2+ sources, saves facts with URLs | Google News RSS + agent web search |
| 2. Script | One sentence per line, each backed by a fact ID; scene plan per line (setting, cast, props, action, big text, camera, mood) | agent |
| 3. Voiceover | One neural-voice clip per line, so every scene cut and every caption word is timed exactly | edge-tts (free Microsoft voices) |
| 4. Assets | Agent draws the cast and props as SVG symbols, then one animated scene per line | agent |
| 5. Video | Headless Chromium renders every frame; original music and whoosh sound effects are generated in code; voice, music and video are mixed with ffmpeg | Playwright + ffmpeg |
| 6. Review | A separate reviewer agent looks at a frame of every scene and re-checks every line against the sources. Bad scenes are redrawn, wrong lines are re-voiced, and the video is rendered again | agent |
| Package | 3 titles, description with sources, tags, thumbnail PNG | agent |

## Output (`output/<date>-<topic>/`)

- `video_final.mp4`: 1920x1080, 24 fps
- `thumbnail.png`, `youtube.md` (titles, description, tags)
- `script.md` (every line with its source), `research.json`
- `review_*.json` (reviewer scores and notes), `review/` (one frame per scene)

## Using a voice from another website

Make the voiceover on any voice site from `script.md`, leaving a short pause between lines.
Then re-run the same folder with that voice:

```
./run.sh --resume output/<folder> --voice-file my_voice.mp3
```

Research, script and drawings are reused. Lines are matched to the pauses in your recording.

## Requirements

Python 3.10+, Node 18+ with `playwright` (Chromium), ffmpeg, and Claude Code (`claude`) logged in.
