# Lens Inspection Web Rebuild — Integration Guide

Keep the three extracted folders as siblings:

```text
workspace/
  lens-inspection-frontend-v2/
  lens-inspection-backend-v2/
  halcon-export-bridge-v2/
```

## 1. Build the dummy native HALCON bridge (optional but recommended)
The backend also has a Python dummy fallback, so you can skip this initially.

```bash
cd halcon-export-bridge-v2
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

Linux output: `build/liblens_halcon_bridge.so`.

## 2. Start FastAPI
```bash
cd ../lens-inspection-backend-v2
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

To use the compiled native dummy, edit `.env`:
```text
HALCON_BRIDGE_LIB=/absolute/path/workspace/halcon-export-bridge-v2/build/liblens_halcon_bridge.so
```

Then:
```bash
python run.py
```
Swagger: http://localhost:8000/docs
Health: http://localhost:8000/api/v1/health

The backend automatically creates a demo folder dataset so the UI has something to display immediately.

## 3. Start Next.js
```bash
cd ../lens-inspection-frontend-v2
cp .env.local.example .env.local
npm install
npm run dev
```
Open http://localhost:3000

## 4. Load your real offline folder
Use **Load folder** in the UI. You have two choices:

- backend/server path, e.g. `/media/k/OKLIN_DATA`
- browser folder upload

Expected structure can be the structure you showed:
```text
root/
  dark edge/
    IMG_..._FEdge Defect_...h.bmp
    IMG_..._FEdge Defect_...d.bmp
  edge gap/
  edge tear/
  ehacm/
  fov/
  lncs/
```

The scanner groups matching `.h.bmp` and `.d.bmp` names as one logical lens/sample.

## 5. Current data flow
```text
Folder BMP images
  -> FastAPI dataset catalog
  -> Python dummy OR native C++ dummy bridge
  -> JSON inspection result
  -> REST + WebSocket
  -> Next.js matrix/viewer/defects/yield/logs
```

## 6. Replace dummy bridge with actual HALCON
Do not change the frontend contract. Replace only the native implementation behind:

```c
const char* bridge_version(void);
int inspect_image_json(const char* image_path, char* out_json, int out_size);
```

Use the exported HDevelop procedure in `real_halcon_bridge_template.cpp` and return the documented JSON result.

## 7. Before factory/PLC deployment
The offline rebuild is intentionally separated from production control. The next integration phase must supply and validate:

- exact PLC protocol / ADS variables / handshakes
- camera SDK and MAC/channel mapping
- exact meaning of image suffixes and recipe mapping
- production HALCON SPH/TOR/MFL procedures
- registration transforms and scale calibration
- real error maps and limits
- user/AD role mapping
- Inbox/Outbox/SSRS audit workflow
- ring-buffer and recurring storage behavior
- trigger timing, timeouts and interlocks
- production validation / FAT / SAT

Do not connect web buttons directly to production actuators until the control interlocks and permission model are implemented and validated.
