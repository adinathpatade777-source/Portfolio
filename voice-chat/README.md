# Voice Chat with GPT

Talk to GPT out loud in your browser. You speak, the app transcribes it, GPT replies, and the reply is read back to you in a natural voice.

**How it works:** microphone → `gpt-4o-mini-transcribe` (speech to text) → `gpt-4o-mini` (reply) → `gpt-4o-mini-tts` (text to speech) → speakers.

## Run it

You need an [OpenAI API key](https://platform.openai.com/api-keys) (with billing set up on your OpenAI account).

### Option A — no install (easiest)

Open `public/index.html` in Chrome, Edge, Firefox or Safari, or open the GitHub Pages copy of it. Paste your API key when asked, then tap the mic. The key is saved only in your browser and is sent only to OpenAI.

### Option B — with the Node server (keeps your key off the browser)

You need Node.js 18 or newer.

```bash
cd voice-chat
cp .env.example .env      # then paste your key into .env
npm start
```

Open http://localhost:3000 and allow microphone access. If `.env` has no key, the page asks for one, as in option A.

## Troubleshooting

- **"Microphone access was blocked"**: click the lock icon in the address bar, allow the microphone, and reload.
- **"OpenAI error (401)"**: the key is wrong. The page asks you for it again.
- **"OpenAI error (429)"**: your OpenAI account has no credit or hit a limit. Check billing at platform.openai.com.
- **"Port 3000 is busy"**: run `PORT=3001 npm start`.
- **No sound**: tap the mic once. Some browsers block audio until you've clicked something on the page.

## Using it

- **Tap the mic** to start talking, then tap it again to send.
- **Hands-free mode:** the app sends on its own when you stop talking, then starts listening again after GPT replies, so you can keep a conversation going.
- **Interrupt:** tap the mic while GPT is speaking to cut it off and talk.
- **Voice:** pick any of the OpenAI voices from the dropdown.
- **Typing:** use the text box if you'd rather type.

## Configuration (`.env`)

| Variable | Default |
|---|---|
| `OPENAI_API_KEY` | *(required)* |
| `PORT` | `3000` |
| `CHAT_MODEL` | `gpt-4o-mini` |
| `STT_MODEL` | `gpt-4o-mini-transcribe` |
| `TTS_MODEL` | `gpt-4o-mini-tts` |
| `SYSTEM_PROMPT` | short, conversational assistant |

With the Node server, your API key stays on the server and never reaches the browser. Microphone access only works on `localhost`, over HTTPS, or when the file is opened directly from your computer.
