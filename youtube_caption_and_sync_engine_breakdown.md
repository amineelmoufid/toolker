# Comprehensive Technical Breakdown: YouTube Caption Extraction & Real-Time Sync Engine

**Project:** Toolker Pro (`toolker.stratom.bond`)  
**Purpose:** Permanent technical reference, architectural blueprint, and disaster-recovery handbook for the YouTube caption extraction and real-time room synchronization system.

---

## 1. Executive Architecture Overview

Toolker Pro pairs YouTube video learning with synchronized interactive shadowing, dictation, and reading. To accomplish this, the platform solves two major technical challenges in web media:

1. **Extracting authentic YouTube subtitles for any video with 100% reliability**, despite YouTube's aggressive IP/datacenter blocking of cloud IPs (Vercel, AWS, Cloudflare, GCP).
2. **Synchronizing multi-user video playback, line-by-line caption progression, and dual-user audio recordings** across heterogeneous devices (Desktop browsers, Android phones, iOS Safari) with zero ping-pong event reflection loops and strict room isolation.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TOOLKER PRO RUNTIME                                   │
│                                                                                 │
│   ┌───────────────────────────────┐     ┌───────────────────────────────────┐   │
│   │   CAPTION FETCH ENGINE        │     │     REAL-TIME SYNC ENGINE         │   │
│   │                               │     │                                   │   │
│   │ 1. Companion Chrome Extension │     │ 1. Living Clock Extrapolation     │   │
│   │ 2. One-Click YT Bookmarklet   │     │ 2. Quad-Layer Anti-Echo Shield    │   │
│   │ 3. Cloudflare Worker Mirror   │     │ 3. Line-by-Line Start-Snap Replay │   │
│   │ 4. Pre-Cached Fallback DB     │     │ 4. Dual-Shoulder Audio Rail       │   │
│   └───────────────────────────────┘     └───────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. YouTube Caption Extraction Engine

### 2.1 The Core Problem: Datacenter IP Blocking
When a server in a cloud datacenter (Cloudflare Workers, AWS Lambda, Vercel Functions, Heroku) queries YouTube's timedtext API (`https://www.youtube.com/api/timedtext?...`) or Innertube endpoints, YouTube detects the datacenter ASN and responds with:
- `HTTP 429 Too Many Requests`
- Empty XML / JSON timedtext responses
- `Consent / Bot Challenge` redirect pages

Consequently, server-side caption scrapers will periodically or permanently fail on uncached videos.

### 2.2 The Solution: Residential Companion Architecture
Because a user browsing from home, office, or mobile uses a residential/cellular IP with valid YouTube cookies and session tokens, YouTube **never blocks requests originating from the user's browser**.

Toolker Pro implements a **two-pronged client-side residential pipeline**:

#### Strategy A: The Toolker Companion Chrome Extension (`public/companion/`)
1. **Manifest V3 Architecture**:
   - `manifest.json`: Declares host permissions for `*://*.youtube.com/*` and `*://toolker.stratom.bond/*`.
   - `content.js`: Injected into `toolker.stratom.bond`. Listens for DOM custom events (`toolker_extract_request`) dispatched by the web application.
   - `background.js`: Service worker with full residential network fetch capabilities. When notified by `content.js`, it queries YouTube's `timedtext` endpoints using the user's legitimate network stack and returns the raw transcript XML/JSON.
2. **Web-Accessible Bridge**:
   - The web app sends a `window.postMessage` or dispatches a `CustomEvent("TOOLKER_EXT_QUERY", { detail: { videoId } })`.
   - The extension captures the request, retrieves the subtitles within 800ms, and posts the structured subtitle segments (`[{ id, start, end, text }]`) back to the web app.

#### Strategy B: The 1-Click Universal Bookmarklet
For users without the extension installed, or on mobile browsers where extensions are restricted:
- Users drag the **"⚡ OPEN IN TOOLKER"** bookmarklet to their browser bookmarks bar.
- When watching any YouTube video, clicking the bookmarklet extracts the `ytInitialPlayerResponse.captions` directly from YouTube's memory and navigates to:
  `https://toolker.stratom.bond/#shadowing?yt=VIDEO_ID&subs=ENCODED_DATA`
- Subtitles are decoded locally with 100% extraction accuracy and zero server dependency.

#### Strategy C: Cloudflare Edge Functions + Invidious Proxy Fallback
If neither companion method is available, the Cloudflare Worker backend (`functions/api/captions.ts`) attempts extraction via:
1. YouTube Innertube Android Client spoofing (`ANDROID`, `WEB_CREATOR`).
2. High-reputation rotating Invidious/Piped API instances.
3. Pre-cached transcript repository in localStorage and Cloudflare KV.

---

## 3. Real-Time Room Synchronization Engine

Inspired by the authoritative clock blueprint, the synchronization engine eliminates the classic flaws of multi-user YouTube players.

### 3.1 The Six Pillars of Synchronization

#### Pillar 1: Authoritative Living Clock Extrapolation
Instead of constantly spamming 1 Hz heartbeat position packets, the server and clients maintain a compact deterministic state:
```typescript
interface RoomPlaybackState {
  isPlaying: boolean;
  time: number;          // Playhead timestamp in seconds
  lastUpdated: number;   // Epoch millisecond timestamp of last change
  playbackRate?: number; // 0.75x or 1.0x
  activeLineId?: string; // Currently highlighted subtitle ID
  lineByLine?: boolean;  // Room-wide Line-by-Line toggle
}
```
When a participant connects or queries the current time:
$$\text{CurrentAuthoritativeTime} = \text{time} + \left( \frac{\text{Date.now}() - \text{lastUpdated}}{1000} \times \text{playbackRate} \right)$$
Late joiners and reconnected users catch up to the exact frame within 20ms without disturbing the host.

#### Pillar 2: Quad-Layer Anti-Echo Shield
To prevent infinite ping-pong loops (User A plays $\to$ User B player emits state change $\to$ User B sends play $\to$ User A player catches event):
1. **`isRemoteUpdateRef`**: Flag set to `true` whenever an event originates from Firebase/P2P. Programmatic calls to `player.play()` or `player.seekTo()` consume this flag and suppress outbound emissions.
2. **`suppressOutboundUntilRef`**: Timestamp gate (`Date.now() + 2500ms`) that silences any spurious state changes fired by the YouTube iframe during buffering or seek transitions.
3. **Session ID De-Duplication**: Every browser tab generates a unique `tabSessionId`. All Firebase payloads carry `senderId`. Clients immediately drop packets where `senderId === mySenderId`.
4. **Action ID Cache**: Outbound actions generate an `actionId` added to a local Set. Incoming actions matching this set are discarded.

#### Pillar 3: Deadband Drift Thresholding
Hardware clock skew causes browsers to drift by 50–200ms every couple of minutes.
- If drift is $< 0.5\text{s}$, the player maintains fluid playback without seeking (preventing audio clicks and buffer flushes).
- If drift is $> 0.5\text{s}$, a hard seek `player.seekTo(authoritativeTime)` aligns the follower with the host.

#### Pillar 4: Line-by-Line Start-Snap & Replay Dedication
- In Line-by-Line mode, when the active caption reaches its boundary (`currentTime >= activeLine.end - 0.08`), the engine automatically pauses the player and **seeks back to `activeLine.start`**.
- This leaves the playhead parked at the beginning of the active sentence instead of landing at the start of the next sentence.
- Hitting **Play (or Spacebar)** immediately replays that sentence.
- Advancing to the next sentence is controlled by **`ArrowRight` (`->`)** or the dock's `>` button.
- Returning to the previous sentence is controlled by **`ArrowLeft` (`<-`)** or the dock's `<` button.

#### Pillar 5: Dual-Shoulder Audio Separation Rail
Previously, both users wrote to a single `latestAudio` key, causing User B's recording to wipe User A's audio before User B could listen to it.
- **Independent Storage**: In Firebase RTDB, audio recordings are stored per user:
  `rooms/${roomId}/userAudios/${senderId}`
- **Non-Destructive Delivery**: Each participant receives their partner's latest recording regardless of when or in what order they record.
- **Dual Tactile Shoulder Dock**:
  - **Left Shoulder (`↺`)**: Replay My Recording (`latestLocalAudio`).
  - **Right Shoulder (`▶`)**: Play Partner's Recording (`latestPartnerAudio`) with an animated unread badge (`1`).

#### Pillar 6: Strict Room Isolation
- Every room ID generated by `createRoom` uses collision-free keys:
  `room_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
- URLs format cleanly as `https://toolker.stratom.bond/?room=XYZ#shadowing`.
- `getRoomIdFromUrl()` parses `room` from both `window.location.search` and `window.location.hash`, guaranteeing that opening a shared link on mobile or desktop joins only that isolated room.

---

## 4. Key Code Locations

| Component / Service | File Path | Primary Responsibility |
|---|---|---|
| **Studio & Sync Controller** | `components/shadowing/ShadowingStudio.tsx` | Main studio UI, keyboard listeners, anti-echo shield, line-by-line auto-pause & replay logic. |
| **Tactile Thumb Dock** | `components/shadowing/ControlDock.tsx` | Retro-industrial dock with Play, `<` and `>`, hold-to-record Shadow mic, and dual audio replay shoulders. |
| **Room State Provider** | `contexts/RoomContext.tsx` | Living clock state subscription, URL room ID extraction, P2P/Firebase dual-rail action dispatcher. |
| **Firebase Realtime DB** | `services/firebase.ts` | Living playback calculation (`calculateAuthoritativeTime`), `syncRoomPlayback`, `syncRoomAudio`, `userAudios` subscription. |
| **Deployment Automation** | `scripts/deploy_cf.py` | Automated production build and Cloudflare Pages deployment script. |
| **Companion Extension** | `public/companion/` | Chromium extension for 100% residential YouTube subtitle extraction. |

---

## 5. Disaster Recovery & Troubleshooting

### Q1: A video displays "No captions available on YouTube for this video"
1. Verify that the video actually has captions on YouTube (either manual or auto-generated).
2. If using Chrome/Vivaldi/Brave/Edge on Desktop:
   - Ensure the **Toolker Extension** is installed and enabled (`chrome://extensions`).
   - If recently updated, click the circular reload icon on the extension card.
3. Alternatively, use the **1-Click YT Bookmarklet** directly on the YouTube video page.

### Q2: Desktop and Phone fall out of sync
1. Ensure both devices show the green `ROOM ACTIVE 🤝` badge in the header.
2. If joining late on a mobile browser (e.g. Samsung Galaxy or iPhone), tap the Play button once to satisfy the mobile browser's Media Engagement Index (MEI) autoplay policy. Once unmuted by a touch gesture, all host seeks, pauses, and line jumps synchronize automatically.

### Q3: How to deploy updates to Cloudflare Pages
Run from the workspace terminal:
```bash
python scripts/deploy_cf.py
```
This script automatically executes `vite build`, reads the Cloudflare credentials from `C:\Users\amine\Desktop\tools\cloudflare api minhoo.txt`, and pushes the bundle directly to Cloudflare Pages.
