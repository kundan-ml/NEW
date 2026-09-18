# Lens Inspection Control Center — Frontend V6

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
NEXT_PUBLIC_APP_NAME=Lens Inspection Control Center
```

`BACKEND_API_URL` is used by the Next.js image proxy so the HTML5 canvas receives a same-origin image and can safely inspect pixels.

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
