# YouTube Caption Extraction Engine — Complete Technical Guide & Runbook

## Overview
This document provides the complete architecture, diagnosis history, implementation details, and fallback runbooks for Toolker's YouTube Caption Extraction Engine. It explains why server-side/edge fetching fails on YouTube, how the residential client companion architecture solves it with 100% reliability, and how to maintain or extend the system in the future.

---

## 1. The Core Problem: Why Cloud / Edge Extractors Fail

### The YouTube Datacenter IP Ban (`LOGIN_REQUIRED`)
Historically, caption extractors (like `youtube-transcript-api`, simple scrapers, or Cloudflare Workers) attempted to fetch YouTube timedtext or watch pages directly from server IPs (AWS, Google Cloud, Cloudflare, DigitalOcean, Hetzner, etc.).
- **What YouTube does:** YouTube uses ASN and IP reputation intelligence to identify traffic originating from hosting datacenters.
- **The response:** When a request arrives from a datacenter IP, YouTube responds with `403 Forbidden` or a JSON error:
  ```json
  {
    "status": "FAIL",
    "reason": "Sign in to confirm you’re not a bot",
    "errorcode": 150
  }
  ```
- **Why Pre-Cached Videos Worked:** In development, pre-cached videos had their captions stored directly in mock databases or static JSON files, which bypass YouTube entirely. As soon as a user pasted an arbitrary live YouTube URL, the datacenter worker hit YouTube's bot wall, resulting in `"No captions available on YouTube for this video."`

---

## 2. The Solution: Residential Companion Architecture

To achieve 100% reliable extraction for any public YouTube video with subtitles/transcripts, Toolker uses a **Multi-Tier Residential Companion Strategy**:

```
+---------------------------------------------------------------------------------------+
|                                    USER BROWSER                                       |
|                                                                                       |
|   1. Toolker Extension (v1.0.3)             2. 1-Click Bookmarklet                     |
|      - Residential IP (User's ISP)             - Runs in youtube.com context          |
|      - Android InnerTube Client API            - Extracts ytInitialPlayerResponse     |
|      - Bypasses CORS & bot wall                - Sends transcript directly to Toolker |
|                           \                   /                                       |
|                            v                 v                                        |
|                     +-------------------------------+                                 |
|                     |   Toolker Shadowing Studio    |                                 |
|                     +-------------------------------+                                 |
|                                     ^                                                 |
|                                     | 3. Universal Fallback                           |
|                         +-----------------------+                                     |
|                         | Direct SRT/VTT/Paste  |                                     |
|                         +-----------------------+                                     |
+---------------------------------------------------------------------------------------+
```

### Architecture Pillars:
1. **Toolker Chrome / Vivaldi / Edge Companion Extension (`extension/`):**
   - Runs in the background of the user's browser using the user's own home/residential IP.
   - When the user pastes a URL into Toolker, Toolker broadcasts `TOOLKER_EXT_EXTRACT_CAPTIONS`.
   - The extension calls YouTube's official **Android InnerTube API** (`https://www.youtube.com/youtubei/v1/player` with client `ANDROID` `20.10.38`). YouTube does NOT block Android mobile client requests.
   - The extension receives `captionTracks`, fetches the `timedtext` payload (supporting both `srv3` XML and standard XML), parses it into normalized Toolker `SubtitleLine[]` format `{ id, start, end, text }`, and sends it back via `window.postMessage`.
   - **Zero Bot Detection:** Since it originates from a real user's browser with valid residential headers and mobile client payloads, YouTube serves the transcript without auth gates.

2. **1-Click YouTube Bookmarklet (Zero-Install Alternative):**
   - For users who do not have the extension installed or are on mobile/guest browsers:
   - A bookmarklet draggable from the modal header.
   - Clicking it while on any YouTube video extracts `ytInitialPlayerResponse.captions` directly from YouTube's running page memory and redirects into Toolker Studio with subtitles pre-loaded in the URL state.

3. **Universal Manual Transcript & SRT Drawer:**
   - If a video has no automatic or creator subtitles on YouTube (e.g. music videos with no lyrics or raw ambient audio), users can open the manual transcript drawer to paste text or drop an `.srt` / `.vtt` file.

---

## 3. Extension Implementation Details (`extension/`)

### Manifest (`extension/manifest.json`)
- `manifest_version: 3`
- `permissions: ["storage"]`
- `host_permissions: ["*://*.youtube.com/*", "*://*.googlevideo.com/*"]`
- `content_scripts`: Matches `*://toolker.stratom.bond/*`, `*://*.pages.dev/*`, and `http://localhost:*/*`.

### Background Worker (`extension/background.js`)
- Uses YouTube Android client identity:
  ```json
  {
    "context": {
      "client": {
        "clientName": "ANDROID",
        "clientVersion": "20.10.38",
        "androidSdkVersion": 34,
        "hl": "en",
        "gl": "US"
      }
    },
    "videoId": "VIDEO_ID"
  }
  ```
- **Important Gotcha:** Do NOT set the `User-Agent` header in `fetch()` calls inside the extension background worker, as modern Chromium flags `User-Agent` as a forbidden header in Fetch API and will reject the request. The JSON body client identity is what YouTube evaluates.

### Content Script (`extension/content.js`)
- Bridges `window.postMessage` from Toolker web app to `chrome.runtime.sendMessage` in the extension.
- Emits `TOOLKER_EXT_INSTALLED` heartbeat on document load so the Toolker UI immediately lights up the green `COMPANION ACTIVE ✓` badge.

---

## 4. Frontend Integration (`components/shadowing/VideoLibraryModal.tsx`)

### Detection & Handshake
1. On modal mount, the frontend listens for `TOOLKER_EXT_HEARTBEAT` or emits `TOOLKER_PING_EXT`.
2. When detected:
   ```ts
   setExtensionConnected(true);
   ```
3. During URL import:
   - If extension is connected, emit `TOOLKER_EXT_EXTRACT_CAPTIONS`.
   - If successful, instantly format captions, extract YouTube video metadata (title, thumbnail), and transition to the studio.
   - If Error 150 (embed restriction) occurs on playback, the app notifies the user that subtitles are 100% captured and ready, providing the synced YouTube companion pop-up option.

---

## 5. Deployment Runbook

### Deploying the Web App to Cloudflare Pages
Toolker is deployed via direct API upload to Cloudflare Pages using Python script `scripts/deploy_cf.py`.

```bash
# 1. Build the production React bundle
npm run build

# 2. Deploy dist/ directory using the Cloudflare API Token
python scripts/deploy_cf.py
```

### Updating the Companion Extension
1. Open Chromium browser (`chrome://extensions` or `vivaldi://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `C:\Users\amine\Desktop\tools\toolkerpro\extension`.
4. If modifying files in `extension/`, click the **Reload (circular arrow)** button on the Toolker Companion card in `chrome://extensions`.

---

## 6. Troubleshooting & Recovery Cheatsheet

| Issue | Likely Cause | Solution |
| :--- | :--- | :--- |
| `"Extension not detected"` | Extension not loaded or updated in browser | Reload extension in `chrome://extensions` and refresh page |
| `"No captions available"` | Video has 0 captions on YouTube | Check if CC button exists on YouTube for that video. If none, use Universal SRT/Paste Drawer |
| `User-Agent forbidden header` | Header set in `fetch()` | Keep `User-Agent` omitted in `extension/background.js` |
| `CORS Error on timedtext` | Host permissions missing | Ensure `*://*.youtube.com/*` and `*://*.googlevideo.com/*` are in `manifest.json` `host_permissions` |
| `Error 150 / Embedding disabled` | YouTube creator disabled third-party embedding | Handled by Toolker's Synced YouTube Pop-up alongside Studio |
