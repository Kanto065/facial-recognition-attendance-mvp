# Warehouse Enterprise Release 1 — Architecture & Decisions

Living document for the `feature/enterprise-warehouse-v1` branch. Update this alongside code as each milestone lands — do not let it drift out of sync with what's actually implemented.

## Goal

Evolve the facial-recognition attendance MVP into a Release 1 system for a warehouse with 5-6 zones, each with multiple cameras:
- Server-side RTSP ingestion (central on-prem server, no per-zone edge boxes for Release 1).
- Per-zone, per-person access levels (full/partial/none — green/yellow/red), logged and flagged in software only (no physical door/turnstile control in Release 1).
- Admin dashboard for zones, cameras, person↔zone access, live event feed, and historical log.
- Generic `persons` data model (internal/external + admin-configurable type) so the schema isn't tied to warehouses specifically.

## Decisions Log

| Decision | Status | Notes |
|---|---|---|
| CPU-only inference (no GPU) | Decided | Multiprocessing worker pool gives real parallelism at target scale (~10-24 cameras × 1-2fps). Revisit only if M3 load testing shows it's insufficient. |
| Software-only access enforcement | Decided | Denied/flagged access is logged and shown in the dashboard; no hardware door/turnstile integration in Release 1. |
| "Partial" access = time-windowed (extensible) | Decided | `zone_access_rules.conditions` JSON column keeps room for other partial mechanisms (escort-required, etc.) without a schema rewrite. |
| Demo cameras = office PCs' webcams bridged to RTSP | Decided | via `mediamtx` + `ffmpeg` per demo PC; central server treats the RTSP URL like any real camera — no ingestion code path difference. |
| Interim: browser-webcam cameras alongside RTSP | Decided | Added `cameras.source_type` (`rtsp`/`browser`, `rtsp_url` now nullable). A `browser` camera has no RTSP URL — instead, a device opens the **Capture** page, picks which registered camera it's acting as, and streams its own webcam straight to `POST /api/cameras/{id}/recognize` (polling, ~700ms). This exists because RTSP bridging (mediamtx/ffmpeg) wasn't set up yet and the user wanted the MVP's live name-overlay feed back immediately; it reuses the same `recognize_faces`/`decide_access`/event-logging path RTSP ingestion (M2/M3) will use, so nothing here is throwaway — RTSP cameras will just be another frame source feeding the same pipeline. |
| Deployment: Windows Server only, no Docker | Decided | Supersedes an earlier dual Windows+Linux requirement. Native Windows Service (e.g. via NSSM) hosting Uvicorn + venv. |
| Database: MSSQL (SQL Server) | Decided | Supersedes an earlier PostgreSQL recommendation. SQLAlchemy `mssql` dialect via `pyodbc`. |
| Generic `persons` model, not `employees` | Decided | `category` enum (internal/external) + `person_type_id` FK to an admin-configurable `person_types` lookup table, so the schema is reusable outside a warehouse context. |
| Backend stays Python/FastAPI (not .NET) | Decided | Evaluated moving to .NET/C# for performance; rejected because the multiprocessing ingestion design already sidesteps Python's GIL for CPU-bound inference, and a rewrite would mean re-deriving the working detection/alignment/matching pipeline in C# for a gain the architecture doesn't need at target scale. ONNX weights are portable if this is revisited later. |
| Vector search: keep FAISS, not MSSQL native vector type | Assumed, open | Assumes standard SQL Server without the (recent, 2025+/Azure SQL) native `VECTOR` type. Revisit if the target server turns out to support it. |
| Frontend base: adapted from an existing admin-dashboard template | Decided | Reused (not built from scratch): Vite + React 18 + TypeScript, shadcn/ui + Radix, TanStack Query, React Router, sidebar `DashboardLayout`. Source: a sibling project's `admin-frontend` (React admin dashboard template owned by the same author), stripped of its original domain-specific pages and rewired to this backend. Chosen because a working, well-structured auth flow + CRUD page pattern already existed there — reusing it was clearly less work than building the same shell from zero. |
| Auth: JWT access + refresh tokens (bearer), not cookie session | Decided | Supersedes the earlier "httpOnly cookie session" recommendation. The reused frontend template's `AuthContext`/`api.ts` already implement a JWT access+refresh flow (tokens in `localStorage`, `Authorization: Bearer` header, automatic refresh-and-retry on 401) — matching that contract was far less work than reworking already-built, working client code to a cookie scheme. Bearer tokens also sidestep CORS-credentials/SameSite complexity for a SPA that may be opened from different client machines. Backend responses are wrapped in a `{success, statusCode, message, data}` envelope (`app/envelope.py`) to match what the reused `api.ts` already expects. |

## Open Items (not blocking, revisit as they become concrete)

- Exact camera count/protocol beyond RTSP — planning assumes ~2-4 cameras/zone × 5-6 zones.
- Retention policy for `attendance_events` / `access_events` — default is keep indefinitely for Release 1.
- SQL Server version/edition on the target server is unconfirmed.
- Initial `person_types` seed values (assumed: employee, contractor, visitor, vendor) — confirm during M1 dashboard work.

## Data Model (MSSQL)

- **`persons`** — id, full_name, category (`internal`/`external`), person_type_id → `person_types`, status (active/inactive).
- **`person_types`** — admin-configurable lookup (id, name, category) — not a hard-coded enum, so new domains/types can be added without a migration.
- **`person_face_embeddings`** — person_id FK, faiss_index_id — bridges MSSQL identity to the FAISS vector index (FAISS has no delete-by-id).
- **`zones`** — id, name, description, zone_type.
- **`cameras`** — id, zone_id FK, source_type (`rtsp`/`browser`), rtsp_url (nullable — encrypted, only set for `rtsp`), enabled, sampling_fps.
- **`zone_access_rules`** — person_id FK, zone_id FK, access_level (`full`/`partial`/`none`), valid_from/valid_until, conditions (JSON). Unique (person_id, zone_id).
- **`attendance_events`** — person_id FK (nullable), camera_id FK, zone_id FK, timestamp, confidence.
- **`access_events`** — person_id FK (nullable), camera_id FK, zone_id FK, access_level_at_time, decision (allowed/flagged/denied), timestamp, confidence.
- **`admin_users`** — id, username, password_hash, role (single `admin` role for Release 1).

## Module/Process Boundaries

```
backend/app/
  config.py          # settings: DB connection string, sampling defaults, secrets (pydantic-settings)
  envelope.py         # {success, statusCode, message, data} response wrapper + exception handlers
  auth/
    security.py         # password hashing (passlib/bcrypt), JWT access+refresh token create/decode
    dependencies.py       # require_admin FastAPI dependency (Bearer token -> AdminUser)
  routers/
    auth.py              # /api/auth/login, /me, /refresh, /change-password           [done]
    persons.py            # /api/persons, /api/person-types                            [done]
    zones.py               # /api/zones CRUD                                            [done]
    cameras.py              # /api/cameras CRUD + POST /{id}/recognize (browser-source)   [done]
    access_rules.py          # /api/access-rules matrix get/upsert                        [done]
    enroll.py                 # /api/enroll — creates Person + face embedding             [done]
    events.py                  # GET /api/events/recent (polling live feed)               [done, interim]
    ws.py                       # /ws/events websocket, replaces polling                    [M4]
  db/
    session.py         # SQLAlchemy engine/session (MSSQL via pyodbc), get_db dependency
    models.py            # ORM models: Person, PersonType, Zone, Camera, ZoneAccessRule,
                          # AttendanceEvent, AccessEvent, AdminUser, PersonFaceEmbedding
  recognition/
    matcher.py          # single-owner wrapper: loads SCRFD/ArcFace + FaceDatabase (FAISS),
                          # enroll_face() / remove_person_faces() / recognize_faces()      [done]
    access_decision.py   # (person, zone) -> zone_access_rules -> allowed/flagged/denied   [done]
  ingestion/              # per-camera RTSP reader + inference worker pool                 [M2/M3]
  events/                 # in-process pub/sub fan-out to websocket connections            [M4]
  database/faiss_db.py  # unchanged, now owned exclusively by recognition/matcher.py
  models/                # unchanged: scrfd.py, arcface.py
  utils/                 # unchanged: helpers.py
```

FAISS must be owned by exactly one process; ingestion workers (M2/M3) call into `recognition/matcher.py` rather than each loading their own copy, to avoid index corruption from concurrent writes.

`backend/scripts/seed.py` bootstraps the first admin user and default `person_types` — run once after `alembic upgrade head`.

## Frontend

`frontend/` was replaced wholesale (not incrementally extended) with an adapted copy of a sibling project's admin-dashboard template — see the Decisions Log above for why. Stack: Vite + React 18 + TypeScript, shadcn/ui + Radix primitives (`src/components/ui/`), TanStack Query, React Router, sidebar `DashboardLayout` (`src/layouts/DashboardLayout.tsx`, `src/components/AppSidebar.tsx`).

Pages (`src/pages/`):

| Page | Route | Status |
|---|---|---|
| Login | `/login` | done — JWT login against `/api/auth/login` |
| Dashboard | `/dashboard` | done — lightweight counts (persons/zones/cameras); full activity view is M4 |
| Enroll | `/dashboard/enroll` | done — webcam/file capture, posts to `/api/enroll` (ported from the old MVP's `EnrollTab.jsx`) |
| Capture | `/dashboard/capture` | done, interim — a device streams its own webcam as a chosen `browser`-source camera, polling `POST /api/cameras/{id}/recognize`, drawing bounding boxes + name/decision overlay (the MVP's live-feed UX, restored) |
| Persons | `/dashboard/persons` | done — list, edit category/type/status, soft-deactivate |
| Zones | `/dashboard/zones` | done — full CRUD |
| Cameras | `/dashboard/cameras` | done — full CRUD, zone assignment, RTSP or browser-webcam source type |
| Access | `/dashboard/access` | done — person x zone matrix, green/yellow/red `full`/`partial`/`none` |
| Live | `/dashboard/live` | done, interim — polls `GET /api/events/recent` every 2s; will move to the M4 websocket feed once ingestion is real-time |
| Events | `/dashboard/events` | still a placeholder — historical filtering/pagination is M4 scope; `GET /api/events/recent` (used by Live) already provides the underlying data |
| ChangePassword | `/dashboard/change-password` | done |

`VITE_API_BASE_URL` (see `.env.development`) points the SPA at the backend; defaults to `http://localhost:8000`. CORS on the backend allows `http://localhost:8080` (Vite's dev port, see `frontend/vite.config.ts`).

**Verified against a live stack**: connected to a real MSSQL instance (`SERVER-43`, SQL auth — Windows auth doesn't work since it's a separate workgroup machine from the dev box), ran the migrations, and exercised every route via curl plus a real browser session (login, all CRUD pages, enroll with a real face photo, and the Capture→Live live-recognition loop with an actual webcam). Two real bugs were found and fixed this way — see below.

## Milestones

- [x] **M0** — Branch + scaffolding: branch created, this doc, dependencies added, initial Alembic migration.
- [x] **M1** — Data model, JWT auth, CRUD routers for persons/person-types/zones/cameras/access-rules, `/api/enroll`. Verified end-to-end against a live MSSQL instance and a real browser session (see Live-Testing Notes below).
- [x] **M2/M4 interim** — Browser-webcam camera source (`cameras.source_type`), live recognition+access-decision+event-logging via `POST /api/cameras/{id}/recognize` (Capture page), and a polling live feed (`GET /api/events/recent`, Live page). Ships the MVP's name-overlay UX now, ahead of RTSP ingestion, on the same pipeline RTSP will use.
- [ ] **M2 (RTSP)** — Single-camera server-side RTSP ingestion (the `ingestion/` module — ffmpeg/mediamtx-bridged or real IP cameras feeding the same `recognize`/`decide_access`/event-logging path the browser cameras already use).
- [ ] **M3** — Multi-camera/multi-zone ingestion at scale.
- [ ] **M4 (websocket)** — Replace Live page polling with `/ws/events`; build out the full Events history page (filters, pagination).
- [ ] **M5** — Hardening / Release 1 close-out.

**Explicitly deferred beyond Release 1**: per-zone edge inference servers, physical door/turnstile hardware integration, multi-role RBAC, advanced analytics dashboards, punch-in/out shift semantics, GPU inference, Linux deployment.

## Live-Testing Notes

Tested against a real MSSQL instance (`SERVER-43`, SQL login `sa` — cross-machine Windows Integrated Auth doesn't work between workgroup machines, so SQL auth is required; connection details live in the gitignored `backend/.env`). Two real bugs were caught this way and fixed:

1. **`app/recognition/matcher.py` wrong base-directory depth** — copied from `main.py`'s two-`dirname()` pattern without accounting for `matcher.py` living one directory deeper (`app/recognition/` vs `app/`), which would have pointed `weights`/`data` at the wrong folder.
2. **`passlib` + `bcrypt>=4.0` incompatibility** — `passlib[bcrypt]`'s pip extra doesn't pin a compatible `bcrypt` version; pinned `bcrypt<4.0` in `requirements.txt`.
3. **Enroll page black webcam** — the `<video>` element was conditionally rendered on `cameraOn`, so `startCamera()` set `videoRef.current.srcObject` while the ref was still `null`. Fixed by always mounting `<video>` and toggling visibility via CSS, matching the original MVP pattern.
4. **FAISS crash on legacy name-labeled entries** — the FAISS index carried over pre-migration MVP enrollments keyed by name (e.g. `"kanto"`) rather than numeric person id, so `int(label)` in `recognize_faces` threw on any match against one of them. Fixed defensively (non-numeric labels are now treated as unmatched, not fatal) **and** the stale index was purged, since those old entries had no corresponding `persons`/`person_face_embeddings` rows anyway. **This purge also deleted the vectors for two enrollments made during this same testing session** ("Test Astronaut" and a real self-enrollment) — their `persons` rows and `zone_access_rules` still exist, but `person_face_embeddings` was cleared and they need to be **re-enrolled** via the Enroll page to be recognized again. Any future enrollments are unaffected.

## Demo Camera Setup (Office Testing)

Each demo PC bridges its webcam to an RTSP stream so the central server can ingest it exactly like a real IP camera:

1. Install [mediamtx](https://github.com/bluenviron/mediamtx) on the demo PC (a single portable executable, no install required) and run it — by default it listens for RTSP publishers on `rtsp://<demo-pc-ip>:8554/<stream-name>`.
2. Use `ffmpeg` to capture the webcam and publish to it, e.g. on Windows:
   ```
   ffmpeg -f dshow -i video="<camera name>" -c:v libx264 -preset ultrafast -tune zerolatency -f rtsp rtsp://localhost:8554/cam1
   ```
3. On the central server, register a camera in `/cameras` with `rtsp_url = rtsp://<demo-pc-ip>:8554/cam1` and assign it to a zone.
4. Ensure the demo PC and central server are on the same LAN/subnet and that port 8554 (or whatever mediamtx is configured to use) isn't blocked by Windows Firewall.

This is a config/ops step, not application code — the ingestion pipeline (`camera_reader.py`) doesn't distinguish a demo bridge from a real IP camera.
