// Google OAuth + Drive. Google Vids has no public API for creating videos, so the
// hand-off is: save the storyboard as a Google Doc in Drive, then open Google Vids,
// where "Help me create" can generate a video from that Doc.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./store.js";

const TOKEN_FILE = path.join(DATA_DIR, "google-token.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
export const VIDS_URL = "https://vids.google.com/";

let pendingState = null;

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function readToken() {
  try {
    return JSON.parse(await fs.readFile(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function writeToken(token) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2), { mode: 0o600 });
}

export async function googleConnected() {
  return Boolean((await readToken())?.refresh_token);
}

export async function disconnectGoogle() {
  await fs.rm(TOKEN_FILE, { force: true });
}

export function authUrl() {
  pendingState = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: pendingState,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleCallback(code, state) {
  if (!pendingState || state !== pendingState) throw new Error("OAuth state mismatch; try connecting again.");
  pendingState = null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const token = await res.json();
  if (!res.ok) throw new Error(token.error_description || token.error || "Token exchange failed");
  token.expires_at = Date.now() + token.expires_in * 1000;
  await writeToken(token);
}

async function accessToken() {
  const token = await readToken();
  if (!token?.refresh_token) throw new Error("Google is not connected. Click 'Connect Google' first.");
  if (token.access_token && token.expires_at > Date.now() + 60_000) return token.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const fresh = await res.json();
  if (!res.ok) throw new Error(fresh.error_description || "Could not refresh Google token; reconnect Google.");
  const merged = { ...token, ...fresh, expires_at: Date.now() + fresh.expires_in * 1000 };
  await writeToken(merged);
  return merged.access_token;
}

// Create a Google Doc (converted from plain text) and return its id and link.
export async function createDoc(title, text) {
  const token = await accessToken();
  const boundary = "vids" + crypto.randomBytes(8).toString("hex");
  const metadata = { name: title, mimeType: "application/vnd.google-apps.document" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const file = await res.json();
  if (!res.ok) throw new Error(file.error?.message || "Drive upload failed");
  return { id: file.id, name: file.name, url: file.webViewLink };
}
