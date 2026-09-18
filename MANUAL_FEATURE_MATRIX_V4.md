# OKLIN3 Manual → Frontend V4 feature matrix

The supplied OKLIN3 operating manual is the functional reference. This file maps the manual-facing workflow into the V4 frontend. Hardware-dependent actions are represented in the UI and call the backend adapter; real PLC/camera/triggerbox behavior still depends on the production backend integration.

## Operation and access

| Manual workflow | Frontend V4 |
|---|---|
| NoUser / Operator / Service / Administrator | User/role menu in global top bar; access model also shown under System |
| Automatic / Set-up operation | Persistent AUTO / SETUP mode control in global top bar |
| User change / login | Global user menu |
| Status / installation information | Global top bar: line, station, backend/bridge and time |
| System messages | Dashboard workspace + System page |
| Version information | System page |
| Help / manual | System page opens backend-served manual |

## Main inspection window

| Manual workflow | Frontend V4 |
|---|---|
| WT History | Live 16-position matrix |
| Ring-buffer lens recall | Clicking a matrix position loads that lens/image/result |
| Archive ring-buffer images | Archive button per WT |
| Error icon explanation | WT History page symbol panel |
| Camera-head lens display | Real HTML5 canvas viewer |
| Move / scale image | Drag + wheel zoom |
| Zoom control | Floating zoom +/- buttons |
| Center / reset | Fit button + double click |
| 1:1 display | 1:1 button |
| Image coordinate + gray-value display | Live pixel probe |
| Crosshair | Toggleable center crosshair |
| Focus selected defect | Dedicated focus-defect viewer control |
| Error regions | Selectable bounding overlays |
| Error-result selection | Defect list selects overlay |
| All / AT only / no error regions | Error-display selector |
| Hold lens | Hold lens control |
| Lens snapshot | Snapshot action |
| Current WT data | Current-lens information panel |
| WT view | 16-position thumbnail strip |
| Yield | KPI + trend view |
| Image type switch | `.h` High Contrast / `.d` Dark Field; additional configured channels supported |
| F3/F4/F5 | Channel cycle / channel reverse / error overlay toggle |

## Image filter / storage

| Manual workflow | Frontend V4 |
|---|---|
| Position selection | 1–16 selector + all activate/deactivate |
| Result/error selection | Result chips and defect-class chips |
| Apply filter to displayed images | Toggle |
| Storage path | Field |
| Number of images/lenses | Field |
| Total number / per position / per error | Storage-mode selector |
| Storage information | 50-character field |
| Start / stop image storage | Dashboard + Storage page |
| Recurring image storage activation | Toggle |
| Start date/time | Fields |
| Daily pattern | Supported |
| Weekly pattern + days | Supported |
| Interval storage | Supported |
| End on date / after N events | Supported |
| BMP / TIF format | System settings |
| TIF metadata concept | UI explanation / backend contract |

## Advanced functions

| Manual workflow | Frontend V4 |
|---|---|
| Registration | Dedicated Registration page |
| Load registration images | Dataset/folder loader |
| Save images | Registration snapshot action |
| Translation/rotation/scale result | Corrective-transform panel |
| Image scale µm/px | Corrective-transform panel |
| Save to Outbox | Registration action |
| Direct Inbox transfer | Privileged action + confirmation |
| Backup previous registration | Backend result/workflow reflected in UI |
| Focus Check: General | Focus page tab |
| Focus Check: Lens | Focus page tab + four lens states |
| Focus + Resolution | Focus page tab |
| Lighting | Focus page tab |
| Snap | Snap/Evaluate action |
| Grab | Cyclic Grab action; tabs locked while active |
| Load images | Folder loader / dataset selector |
| Save images | Snapshot action |
| Save values | Text export |
| Green/yellow/red comparison limits | Editable comparison-limit table |
| Role-hidden comparison values | Minimum-role selector |
| Hardware jig data package | ZIP data-package action |
| BV Test | Dedicated BV Test page |
| Select lens type / script | Script selector |
| Evaluate one lens | Evaluate selected |
| Evaluate image folder | Evaluate folder |
| Stop folder evaluation | Stop action |

## Variable parameters / setup

| Manual workflow | Frontend V4 |
|---|---|
| Camera assignment / MAC | Camera System page |
| Exposure time | Configured with documented range |
| Black level | Configured with documented range |
| Gain | Configured with documented range |
| Height / Width | Configured with sensor range hints |
| Offset X / Y | Configured with ROI coupling hint |
| Line debouncer | Configured |
| Triggerbox pulse duration | Configured with documented range |
| Triggerbox current | Configured with documented range |
| LED channel | Configured |
| Triggerbox IP | General Settings |
| PLC AMS Net ID / port | General Settings |
| Auto-logoff | General Settings |
| SPC image path | General Settings |
| CSV interval / status / retention | General Settings |
| Image format | General Settings |
| CameraTriggerpulseDistanceMS | Timeout settings |
| ImageProcessingTimeoutMS | Timeout settings |
| Per-position deadline model | 16-position timeout table |

## Customization added in V4

The original manual does not specify modern web personalization. V4 adds this without changing status semantics:

- Midnight / Graphite / Arctic themes
- Azure / Cyan / Violet / Emerald accent
- compact / comfortable / spacious density
- UI scale
- corner radius
- panel opacity
- motion on/off
- ambient glow on/off
- collapsible navigation
- dashboard panel ratio presets or custom sliders
- per-station dashboard module visibility
- settings persist locally per browser/workstation
