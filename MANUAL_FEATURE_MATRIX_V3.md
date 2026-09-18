# OKLIN3 Manual Feature Matrix — V3

This project treats the supplied **OKLIN 3 Optical contact lens inspection — Version 5.x.y** manual as the functional reference. The web application is an offline/development implementation: every operator/setup workflow below has a UI/API representation, while operations that require the real Beckhoff PLC, camera SDK, triggerbox, Active Directory, SSRS or production HALCON procedures are isolated behind adapters and simulated with stored images.

## Operation / main window

| Manual feature | V3 implementation |
|---|---|
| Access levels: NoUser, Operator, Service, Administrator | Development login/role switch, backend permission checks |
| Automatic / Set-up mode | Top-bar mode switch; advanced write operations require SETUP |
| WT history | 16-position WT matrix, status selection, current lens loading |
| Ring buffer | Dataset-backed history; archive selected WT to permanent archive |
| Error icon legend | Dedicated WT History page with manual-style symbol mapping |
| Camera-head lens display | Real HTML5 canvas renderer, pan/zoom/fit/1:1/fullscreen |
| Mouse coordinates / gray value | Live X/Y/gray probe from canvas image buffer |
| Crosshair / center | Toggleable crosshair and fit/reset controls |
| Focus selected defect | Canvas focuses selected defect rectangle |
| Image types | `.h.bmp = High Contrast`, `.d.bmp = Dark Field`; more channels supported by config |
| Hold lens | Dashboard Hold button prevents live job from replacing selected lens |
| Lens snapshot | Snapshot API and dashboard action |
| Error list / selected region | Defect list selects highlighted canvas region |
| All / AT-only / none error display | Dashboard error-display filter |
| WT current data | Position, metadata, image channel, result, pixel probe |
| Yield trend | Yield tab / chart and current KPIs |
| WT view | 16-position lens thumbnail strip and WT workspace |
| System messages | Timestamped log page and dashboard tab |
| Version info | System page with software, parameter, bridge, ML and registration versions |
| Help | Backend serves the supplied manual and System page opens it |

## Image filter and image storage

| Manual feature | V3 implementation |
|---|---|
| Position filters | 1–16 position selector |
| Evaluation-result filters | OK / NOK / WARN filters |
| Error-class filters | Configurable manual-style defect classes |
| Storage path and count | Configurable |
| Storage modes | Total / per-position / per-error |
| Storage information | 50-character field |
| Apply filters to display | Stored setting / UI toggle |
| Recurring image storage | Daily/weekly series model, start date/time, optional interval, end date/event count |
| Start/stop image storage | Runtime state and dashboard/storage actions |
| BMP / TIF | Selectable; TIF output writes JSON metadata, BMP remains raw |

## Advanced / setup functions

| Manual feature | V3 implementation |
|---|---|
| Camera system | Four camera slots, MAC assignment, channel name, exposure, black level, gain, ROI, offset, line debounce |
| Triggerbox settings | LED channel, pulse width, current |
| Registration | Offline transform / image-scale calculation |
| Save registration to Outbox | Implemented |
| Direct registration to Inbox | Service+ only; archives previous data and keeps latest five backups |
| Focus Check: General | Brightness/contrast checks |
| Focus Check: Lens | Four lens-state selector and lens/jig metrics |
| Focus + Resolution | Middle-circle resolution, cross position, focus-jig center |
| Lighting | Brightness / halo-pattern metric |
| Limit colors | Configurable optimum / acceptable ranges -> green / yellow / red |
| User-level hidden outputs | Each comparison metric has a minimum role |
| Snap | Evaluate current stored image |
| Grab | Cyclic evaluation mode; tab switching disabled while active |
| Load image / image folder | Dataset path/folder upload and sample selector |
| Save image | Snapshot action |
| Save Values | Timestamped text export |
| Hardware-jig data package | ZIP containing PDF report, CSV, images, camera PFS-style JSON, lighting config and registration |
| BV Test | Lens-script selector, sample/folder evaluation, stop running job, realtime WebSocket progress |
| General system settings | Installation, triggerbox IP, PLC AMS ID/port, autologoff, SPC path, CSV settings |
| Trigger timeouts | Pulse-distance and image-processing timeout settings + 16-position deadline table |

## Production adapters still requiring machine information

The UI/API workflow exists, but these cannot truthfully control production hardware until the real interfaces are provided:

- Beckhoff ADS PLC symbol names and handshake/state machine
- Real camera vendor SDK / MAC discovery and Snap/Grab trigger calls
- Real triggerbox communication protocol
- Exported HALCON production procedures and their exact input/output contract
- Active Directory / 5-2-1 authentication
- SSRS Inbox/Outbox approval/versioning integration
- Exact plant-specific `ApplicationSettings.conf`, `ErrorMap.conf`, `CTHistoryMap.conf`, `PLCMap.conf`, `ImageSetup.conf` semantics

The backend isolates these dependencies so the frontend does not need to be rewritten when they arrive.
