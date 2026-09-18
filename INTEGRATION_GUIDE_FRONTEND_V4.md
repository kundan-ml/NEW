# Frontend V4 integration guide

## Required services

The frontend expects the V3+ FastAPI backend at `http://localhost:8000/api/v1` by default.

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
BACKEND_API_URL=http://localhost:8000/api/v1
```

`NEXT_PUBLIC_API_URL` is used by browser REST/WebSocket calls. `BACKEND_API_URL` is private to the Next.js server and is used by `/api/image` to proxy image previews into the same origin for reliable canvas rendering and gray-value probing.

## Channel convention

Frontend V4 always presents:

- `*.h.bmp` → **High Contrast**
- `*.d.bmp` → **Dark Field**

Other backend-configured channels remain available if present.

## Canvas data path

```text
FastAPI PNG preview
  -> Next.js /api/image same-origin proxy
  -> browser fetch Blob
  -> HTMLImageElement
  -> visible HTML5 Canvas
  -> offscreen pixel canvas
  -> X/Y + grayscale probe
```

This avoids cross-origin canvas tainting and is the main V4 fix for the previous image-canvas problem.

## Live inspection flow

```text
Next.js
  POST /inspect/{dataset}/run
       ↓
FastAPI job id
       ↓
WebSocket /ws/jobs/{job_id}
       ↓
result events
       ↓
WT matrix + lens viewer + KPIs + defect list
```

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Recommended production deployment

Run Next.js and FastAPI behind the same reverse proxy/origin. Keep the browser talking to relative/same-site URLs where possible. The current environment variables support local development while the image proxy already gives the canvas a same-origin path.
