# Lens Inspection V3 — Integration Guide

## 1. Folder layout

Place the packages side-by-side:

```text
workspace/
├── lens-inspection-frontend-v3/
├── lens-inspection-backend-v3/
└── halcon-export-bridge-v3/
```

## 2. Build dummy HALCON/native bridge

```bash
cd halcon-export-bridge-v3
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

Linux output: `build/liblens_halcon_bridge.so`.

## 3. Run FastAPI

```bash
cd ../lens-inspection-backend-v3
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set in `.env`:

```text
HALCON_BRIDGE_LIB=/absolute/path/to/halcon-export-bridge-v3/build/liblens_halcon_bridge.so
```

Then:

```bash
python run.py
```

## 4. Run Next.js

```bash
cd ../lens-inspection-frontend-v3
cp .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## 5. Your current image folder

The backend recursively scans the folder. Example:

```text
dataset/
├── dark edge/
│   ├── ....h.bmp
│   └── ....d.bmp
├── edge gap/
├── edge tear/
├── ehacm/
├── fov/
└── lncs/
```

Suffixes are treated exactly as requested:

```text
.h.bmp = High Contrast
.d.bmp = Dark Field
```

The folder name remains the development category/ground-truth grouping. The `_F..._U...` filename field is parsed as expected-label metadata and is used only by the dummy engine to generate believable results. A real HALCON engine should decide the actual result.

## 6. Replace dummy inspection with real HALCON

Keep the native ABI stable:

```c
const char* bridge_version(void);
int inspect_image_json(const char* image_path, char* out_json, int out_size);
```

Optional pair ABI:

```c
int inspect_lens_pair_json(
  const char* high_contrast_path,
  const char* dark_field_path,
  char* out_json,
  int out_size
);
```

The JSON result should contain `status`, `defects`, and `measurements`. FastAPI converts it into the stable frontend contract.

## 7. Production hardware phase

After offline validation, implement adapters in this order:

1. Real HALCON export
2. Camera SDK Snap/Grab
3. Registration data and ImageSetup limits
4. Triggerbox writes
5. Beckhoff ADS PLC mapping/state machine
6. Active Directory roles
7. SSRS Inbox/Outbox approval/versioning

The web UI should not require a redesign for those steps.
