# DSM BV 4Cam Inspection System — Frontend V6

Compact premium Next.js workstation UI for the OKLIN3-inspired optical contact-lens inspection workflow.

## V6 focus

V6 is a full UI/UX refinement of the existing frontend. The application logic, API calls, HALCON workflow, image canvas behavior, routes and operator functions are preserved.

The production dashboard is now designed as a **100vh desktop workstation** instead of a vertically growing web dashboard:

- thin classic header
- compact workstation sidebar
- one unified three-pane inspection surface
- draggable WT History / Viewer / Lens Details splitters
- dominant inspection canvas
- compact current-lens metadata and actions
- full 16-position WT strip
- simultaneous Quality / System Activity / Quick Actions workspace
- internal scrolling inside history, defects and logs instead of unnecessary page scrolling

### Visual identity

- midnight navy / graphite base
- off-white typography
- restrained royal-blue accent
- muted teal / emerald process accents
- restrained champagne/gold secondary accent
- semantic OK / NOK / Warning colors remain independent from decorative accent colors
- 4–10 px component radii
- subtle borders and dividers instead of excessive floating cards
- 180–210 ms restrained motion

## Screen targets

The dashboard has explicit tuning for:

- 1366×768
- 1440×900
- 1920×1080
- 2560×1440
- ultrawide monitors

At workstation widths the page stays inside the viewport and uses internal section scrolling. Below the workstation breakpoint, panels stack deliberately instead of introducing horizontal overflow.

## Existing functionality retained

- WT History / ring-buffer selection
- image viewer with pan, zoom, Fit, 1:1, fullscreen and defect focus
- gray-value pixel probe
- crosshair and defect overlays
- `.h.bmp` → High Contrast
- `.d.bmp` → Dark Field
- lens hold
- snapshot
- archive WT
- operator review marker
- defect filters
- 16-position current WT strip
- Yield / Defects / Station analytics
- system log filters
- inspection Start / Stop / Hold
- folder loading
- Image Filters / Camera Setup / Archive / History / Service shortcuts
- AUTO / SETUP switching
- user/role switching
- Ctrl/Cmd + K command palette
- Interface Studio customization

## Resizable dashboard

Drag either thin separator between:

1. WT History ↔ Inspection Viewer
2. Inspection Viewer ↔ Current Lens

The resulting ratios are stored through the existing UI preference system and persist on the workstation.

## Environment

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
BACKEND_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=DSM BV 4Cam Inspection System
```

`BACKEND_API_URL` is resolved by the Next.js server for both `/api/backend` and
the image proxy. Browser API requests no longer target each viewer's own
localhost. Uploads/downloads are streamed, and canvas images remain same-origin
for safe pixel inspection.

## Shared live inspection across workstations

Every inspection workspace observes the backend's current inspection through
`/api/v1/ws/inspection`. Opening another tab, logging in as another user, or
reloading attaches to the running job automatically; it does not start a job.
An authoritative snapshot restores committed results and the latest frame,
then sequenced events update WT History, WT View, canvas and progress together.
New trays/reruns clear pending positions rather than reusing previous frames.
Historical browsing does not disconnect the shared observer; new live frames
bring the viewer back to the active inspection, while idle selection stays put.
Local MANUAL mode still controls automatic starting on upload, not observation.
When no tray job is active, completed **Inspect Selected** results are also
shared through the same snapshot, merging other known positions rather than
clearing the tray. An active tray job keeps priority. Single-lens inspection
keeps its existing response and does not overwrite persisted result files.

All PCs must connect to the **same backend** (one application process), using
the frontend server's LAN address or deployment URL. Configure
`BACKEND_API_URL` to an address reachable from that frontend server. A cloud
frontend cannot reach a backend on its own `localhost` or a private LAN address.
For LAN HTTP installations the socket resolves loopback to the frontend's host.
If the backend is on another host, configure `NEXT_PUBLIC_API_URL` accordingly.
For HTTPS, optionally set `NEXT_PUBLIC_WS_URL=https://your-backend/api/v1`
(or `wss://your-backend/api/v1`) to enable a secure WebSocket. Otherwise the
same-origin HTTP snapshot fallback polls once per second with small unchanged
heartbeats. WebSocket events are immediate; image decoding/network transfer
still take time. Lost events, reconnections and server-generation changes
recover with a full snapshot without discarding the last decoded canvas.

After deploying these changes, restart the frontend and backend **when no job
is running**. Browser reloads preserve running inspection; restarting the
backend itself does not resume its in-memory jobs. Duplicate starts on the
same active dataset reuse its job. Rerunning/clearing history waits for a
cancelled HALCON frame to finish to prevent orphan or interleaved results.

Shared inspection regression checks:

```bash
node scripts/check-backend-transport.cjs
node scripts/check-shared-inspection.cjs
node scripts/check-shared-inspection-ui.cjs
```

Backend checks: `python -m unittest discover -s tests -p 'test_live_inspection.py' -v`.
The browser check requires Chrome and a running frontend (default
`http://localhost:3000`, or pass another URL). It uses independent Classic/admin
and Modern/operator browser profiles with deterministic intercepted API/socket
fixtures; it never sends real inference, history deletion, or UI preference
writes to your backend.

## Fast tray image loading

Classic and Modern WT View use aspect-preserving WebP thumbnails (maximum
384 px per side), while the inspection canvas keeps the full-resolution,
lossless image for zoom, overlays, and gray-value probing. Thumbnail URLs
add `thumbnail=1` to `/api/image`; ordinary image URLs remain full quality.

Only the active tray is warmed, followed by its other illuminations. The
selected lens's alternate full-quality illuminations warm separately when
inspection is idle. In-flight requests are shared, obsolete downloads are
cancelled once no consumer needs them, and byte-bounded caches avoid retaining
whole datasets in memory. Frame URLs stay stable for pan/zoom persistence.
Historical tray selection reuses already-loaded metadata without another
samples/results round trip. WebSocket result updates do not wait for images.

Restart the backend after updating its preview service to enable native
`width=384&format=webp` previews. The proxy also supports older PNG-only backends,
but native thumbnails avoid transferring full PNGs between the servers.
Browser/proxy caches expire after five minutes; mutable local-path image
replacements may take up to this interval to appear under an unchanged URL.

Loading regression checks:

```bash
node scripts/check-preview-cache.cjs
node scripts/check-image-proxy.cjs
```

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run typecheck
npm run build
npm start
```

## Keyboard controls

- `Ctrl/Cmd + K` — command palette
- `F3` — next image channel
- `F4` — previous image channel
- `F5` — defect overlay on/off
- Mouse wheel — zoom inspection image
- Drag — pan image
- Double click — fit image

## Routes

- `/` — live inspection workstation
- `/history` — WT history / ring buffer
- `/storage` — image filtering and storage
- `/bv-test` — BV / HALCON evaluation
- `/focus` — General / Lens / Focus + Resolution / Lighting
- `/registration` — camera registration and Inbox/Outbox workflow
- `/setup` — camera / triggerbox configuration
- `/settings` — system / timeout / storage configuration
- `/system` — roles / version / help / system messages
