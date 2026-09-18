# OKLIN3 Manual -> Web Rebuild Map

## Implemented now for offline development
- Main inspection screen: WT/history matrix, current lens, lens viewer, additional information area
- Offline image-folder evaluation (BV Test style)
- `.h.bmp` / `.d.bmp` multi-image grouping per logical lens sample
- Image type/channel switching
- Defect result list and image-region overlay contract
- Hold/select lens behavior in the web viewer
- Snapshot of current lens image
- Yield calculation/trend for current offline evaluation
- System message/log stream
- AUTO / SETUP application state
- Image-filter/storage configuration model
- Camera settings / triggerbox settings model with bounds validation
- General system settings model
- Focus/brightness development check on stored images
- HALCON-compatible native library ABI + Python fallback
- WebSocket live evaluation progress
- Dataset archive export

## Simulated / development-only
- WT grouping: offline samples are grouped sequentially in batches of 16
- focus/resolution calculation: proxy metrics, not the real ImageComparingTool.hdev limits
- camera settings are persisted but not sent to physical cameras
- triggerbox settings are persisted but not sent to a trigger controller
- AUTO/SETUP mode is application state only; no PLC interlock yet
- defect classification in dummy HALCON bridge comes from the filename F... field

## Requires factory interfaces / real implementation
- PLC WT data and handshakes
- live camera acquisition / Grab / Snap from hardware
- exact camera MAC assignment and LED-controller channels
- exported production HALCON scripts for SPH/TOR/MFL
- real registration transformations and µm/pixel calibration
- ImageSetup.conf / ErrorMap.conf / CTHistoryMap.conf parsing if you want direct compatibility
- Inbox / Outbox lifecycle, SSRS promotion, versioning and audit trail
- Active Directory 5-2-1 authentication and permission mapping
- recurring production image-storage scheduler
- TIF metadata compatibility with the existing machine
- hardware jig PDF/CSV data-package generation
- trigger timing/interlock validation
- real ring buffer behavior and retention policy
- FAT/SAT, validation, safety review and production qualification
