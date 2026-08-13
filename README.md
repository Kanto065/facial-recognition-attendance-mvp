# Facial Recognition Attendance System (MVP)

A minimal, self-hosted facial recognition attendance system: enroll employees by photo, then recognize faces live from a webcam and automatically log attendance. CPU-only, no cloud APIs, no GPU required.

For a deep dive into exactly how detection/embedding/matching works (with model internals), see [PIPELINE.md](PIPELINE.md).

## How it works (short version)

```
Enroll:    JPEG → decode → SCRFD detect (1 face) → align to 112×112 →
           ArcFace embed (512-d) → normalize → add to FAISS + SQLite → save to disk

Recognize: JPEG → decode → SCRFD detect (all faces) → align each →
           ArcFace embed each → normalize → FAISS batch search (cosine sim) →
           threshold @ 0.4 → name or "Unknown" → log attendance (5-min cooldown) →
           JSON boxes → frontend draws rectangles + labels on canvas
```

## Stack

**Backend**
- Python 3.13, [FastAPI](https://fastapi.tiangolo.com/), served by Uvicorn
- [ONNX Runtime](https://onnxruntime.ai/) (`CPUExecutionProvider` only — no GPU)
- OpenCV (`opencv-python-headless`) for image decode/resize, scikit-image for face alignment
- [FAISS](https://github.com/facebookresearch/faiss) (`IndexFlatIP`) for cosine-similarity search over face embeddings
- SQLite (stdlib `sqlite3`) for enrolled-employee and attendance-log records
- FastAPI's `StaticFiles` serves the built React app directly — **one process, one port**, no separate web server needed

**Frontend**
- React + Vite (no Next.js, no router, no state-management library)
- Plain `fetch` for API calls
- Browser `getUserMedia` for webcam access, raw `<canvas>` 2D context for drawing boxes/labels

**Models** — adapted from [yakhyo/face-reidentification](https://github.com/yakhyo/face-reidentification)

| Purpose | Model | File | Size |
|---|---|---|---|
| Face detection | SCRFD-500M | `det_500m.onnx` | 2.4 MB |
| Face embedding | ArcFace MobileFace | `w600k_mbf.onnx` | 13 MB |

These are the lightweight variants, chosen for CPU-only real-time-ish inference (~40ms/frame). Heavier variants (SCRFD-10G, ArcFace-ResNet50) are supported by the same code — see [Swapping models](#swapping-models) — but are far slower on CPU (~350ms/frame) for a modest accuracy gain.

## Project structure

```
backend/
  app/
    main.py              FastAPI app: /enroll, /recognize, /employees, /health
    models/
      scrfd.py            SCRFD face detector (ONNX Runtime)
      arcface.py           ArcFace face embedder (ONNX Runtime)
    database/
      faiss_db.py         FAISS wrapper (add/search/save/load embeddings)
      sqlite_db.py        SQLite wrapper (employees + attendance tables)
    utils/
      helpers.py           Face alignment, distance decoding, cosine similarity
  weights/                 ONNX model files (downloaded separately, see below)
  data/                    FAISS index + SQLite DB (created at runtime)
  certs/                   Self-signed TLS cert/key (generated, see below)
  generate_cert.py         Script to generate a self-signed cert for HTTPS
  requirements.txt

frontend/
  src/
    App.jsx                Tab shell (Enroll / Live Attendance)
    EnrollTab.jsx           Enrollment form + employee list
    LiveAttendanceTab.jsx    Webcam capture, polling, box/label smoothing
    api.js                  fetch wrappers for the backend API
  dist/                    Production build output (created by `npm run build`)

PIPELINE.md                 Deep dive: exactly what happens to an image, model by model
```

## Prerequisites

- **Python 3.13** (or close to it) — [python.org/downloads](https://www.python.org/downloads/). On Windows, check "Add python.exe to PATH" during install.
- **Node.js** (for building the frontend) — [nodejs.org](https://nodejs.org/)
- A webcam, and a browser (Chrome/Edge/Firefox)

## Setup

### 1. Backend

```
cd backend
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
```
(on macOS/Linux: `python3 -m venv venv && venv/bin/pip install -r requirements.txt`)

### 2. Download model weights

Download these two files from the [face-reidentification releases](https://github.com/yakhyo/face-reidentification/releases/tag/v0.0.1) into `backend/weights/`:

- [`det_500m.onnx`](https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/det_500m.onnx) (2.4 MB)
- [`w600k_mbf.onnx`](https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/w600k_mbf.onnx) (13 MB)

Or via PowerShell:
```powershell
cd backend\weights
Invoke-WebRequest -Uri "https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/det_500m.onnx" -OutFile "det_500m.onnx"
Invoke-WebRequest -Uri "https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/w600k_mbf.onnx" -OutFile "w600k_mbf.onnx"
```

### 3. Generate a self-signed HTTPS certificate

Browsers only allow webcam access (`getUserMedia`) on `https://` or `http://localhost` — **not** plain `http://<ip-or-hostname>`. If you'll only ever access this from the same machine via `localhost`, you can skip this and run plain HTTP. Otherwise:

```
cd backend
venv\Scripts\python.exe -m pip install cryptography
venv\Scripts\python.exe generate_cert.py <your-server-ip> <your-server-hostname>
```
This writes `backend/certs/cert.pem` and `backend/certs/key.pem`, valid for `localhost`, `127.0.0.1`, plus whatever you passed in. Pass the actual IP/hostname you'll type into the browser address bar.

### 4. Frontend

```
cd frontend
npm install
npm run build
```
This produces `frontend/dist/`, which the backend serves automatically — no separate frontend server needed in production.

## Running

**Production-style (recommended)** — one process serves both the UI and the API:
```
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-certfile certs\cert.pem --ssl-keyfile certs\key.pem
```
Then browse to `https://<server-ip-or-hostname>:8000/`. You'll get a certificate warning (it's self-signed) — click **Advanced → Proceed**. This is expected and safe for local/LAN use.

Without HTTPS (only works if you're browsing from the exact same machine via `localhost`):
```
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Then browse to `http://localhost:8000/`.

**Development mode** (hot-reload frontend, separate from backend):
```
# terminal 1
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# terminal 2
cd frontend
npm run dev
```
Then browse to `http://localhost:5173/` (Vite dev server, proxies API calls to `localhost:8000` — CORS for this origin is already enabled in `main.py`).

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/enroll` | Form fields: `name` (string), `image` (file). Detects one face, stores its embedding under `name`. |
| `POST` | `/recognize` | Form field: `image` (file, typically a webcam JPEG snapshot). Detects all faces, returns `{ faces: [{ box: [x,y,w,h], name, confidence, matched }] }`. Logs attendance for confident matches (5-minute cooldown per person). |
| `GET` | `/employees` | Returns `{ employees: [{ name, enrolled_at }] }`. |
| `GET` | `/health` | Returns `{ status: "ok", enrolled_faces: <count> }`. |

## Configuration

Tunable constants live at the top of `backend/app/main.py`:

```python
SIMILARITY_THRESH = 0.4          # cosine similarity threshold for a "match"
CONFIDENCE_THRESH = 0.5          # SCRFD detection confidence threshold
ATTENDANCE_COOLDOWN_SECONDS = 300  # don't re-log the same person within 5 min
```

## Swapping models

To use the heavier, more accurate SCRFD-10G + ArcFace-ResNet50 variants:

1. Download `det_10g.onnx` and `w600k_r50.onnx` from the same [releases page](https://github.com/yakhyo/face-reidentification/releases/tag/v0.0.1) into `backend/weights/`.
2. Change `DET_WEIGHT`/`REC_WEIGHT` in `backend/app/main.py` to point at them.
3. **Delete `backend/data/face_database.index` and `backend/data/face_database_names.json` and re-enroll everyone.** Embeddings from different recognition models are not comparable, even though both are 512-dimensional — mixing them silently produces wrong matches.

Expect roughly a 9x increase in per-frame inference time on CPU (~350ms vs ~40ms), which will make the 400ms polling loop in `LiveAttendanceTab.jsx` feel noticeably laggier.

## Known limitations (by design, MVP scope)

- No authentication — anyone who can reach the server can enroll/view attendance.
- No GPU support (CPU-only ONNX Runtime).
- No liveness/anti-spoof detection — a printed photo can be recognized as a match.
- Single camera at a time (whatever the browser's `getUserMedia` picks).
- SQLite + local FAISS index files — not built for multi-instance/production deployment.
- No Docker packaging.
- Self-signed TLS certificate — fine for LAN/internal use, will always show a browser warning.

## Troubleshooting

- **"Could not access webcam: Cannot read properties of undefined (reading 'getUserMedia')"** — you're on plain HTTP from a non-localhost address. Use HTTPS (see step 3 above) or access via `localhost`.
- **Same person flickers between their name and "Unknown"** — this is normal for borderline similarity scores; `LiveAttendanceTab.jsx` already smooths this with a small per-face voting window. If it's still bad, consider enrolling a couple of extra reference photos per person, or lowering `SIMILARITY_THRESH` slightly.
- **Recognition feels slow** — you're likely on the heavier model pair; see [Swapping models](#swapping-models) to revert to the lightweight ones.
