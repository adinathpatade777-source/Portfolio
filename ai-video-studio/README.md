# AI Video Studio

Chain **ChatGPT** and **Claude** into one automated workflow and hand the result to **Google Vids**.

```
Topic ──► ChatGPT (research) ──► Claude (storyboard) ──► ChatGPT (polish) ──► Google Doc ──► Google Vids
```

- Build workflows with any number of ChatGPT or Claude steps; each step can use `{{topic}}`, `{{previous}}` or `{{step:Step name}}`.
- Watch every step stream live in the browser.
- Automate: run on a **cron schedule** or from a **webhook** (Zapier, Make, n8n, Apps Script…).
- Final output is saved as a **Google Doc** in your Drive, ready for Google Vids → *Help me create*.

> Google Vids has no public API for generating videos, so the hand-off is a Drive Doc
> plus a one-click link to open Vids. Everything before that is fully automatic.

## Setup

```bash
cd ai-video-studio
npm install
cp .env.example .env   # then fill in the keys
npm start              # http://localhost:3000
```

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client (Web application). Enable the **Google Drive API** and add `http://localhost:3000/auth/google/callback` as a redirect URI. |
| `WEBHOOK_TOKEN` | Any long random string |

Then click **Connect Google** in the app. It only asks for the `drive.file` scope (files this app creates).

## Automating

**Schedule:** put a cron expression in a workflow's *Schedule* field (e.g. `0 9 * * 1` = Mondays at 9:00) and save. The server must stay running.

**Webhook:**

```bash
curl -X POST "http://localhost:3000/api/hooks/<workflowId>?token=$WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic": "How solar panels work"}'
```

Response includes the final text and the Google Doc link. The webhook URL for each workflow is shown in the editor.

## Files

- `server.js` – Express server, scheduler, webhook
- `lib/providers.js` – Claude (Anthropic SDK) and ChatGPT (OpenAI SDK) calls
- `lib/pipeline.js` – runs the steps and the Google Vids hand-off
- `lib/google.js` – Google OAuth + Drive Doc creation
- `lib/store.js` – workflows and run history in `data/` (git-ignored, includes your Google token)
- `public/` – the web UI
