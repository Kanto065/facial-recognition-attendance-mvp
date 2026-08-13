# How the Recognition Pipeline Works

This describes what happens, step by step, from an image being uploaded to a name appearing on screen — for both `/enroll` and `/recognize`.

## 1. Models used

| Stage | Model | File | Size | Where |
|---|---|---|---|---|
| Face detection | SCRFD-500M | `backend/weights/det_500m.onnx` | 2.4 MB | `backend/app/models/scrfd.py` |
| Face embedding | ArcFace MobileFace | `backend/weights/w600k_mbf.onnx` | 13 MB | `backend/app/models/arcface.py` |
| Similarity search | FAISS `IndexFlatIP` | in-memory + `backend/data/face_database.index` | grows with enrollments | `backend/app/database/faiss_db.py` |

Both models are ONNX, run via `onnxruntime` with `CPUExecutionProvider` only — no GPU. SCRFD is a lightweight anchor-based detector (Sample and Computation Redistribution for Efficient Face Detection); ArcFace-MobileFace is a MobileFaceNet-backbone embedding network trained with the ArcFace margin loss, outputting a 512-dimensional vector per face.

## 2. What happens to an uploaded image

Both endpoints (`POST /enroll`, `POST /recognize`) do the same first three steps; they differ after that.

### Step 1 — Decode
The uploaded bytes (JPEG blob from the browser) are decoded into a BGR pixel array with OpenCV (`cv2.imdecode`). No resizing happens yet — this is the full-resolution frame from the webcam capture or file upload.

### Step 2 — Detect faces (SCRFD-500M)
`SCRFD.detect()` (`backend/app/models/scrfd.py`):
1. Resizes/pads the image into a 640×640 letterboxed input (aspect ratio preserved, padded with black).
2. Runs one ONNX forward pass. The model outputs, at three feature-map strides (8, 16, 32), a confidence score, a bounding-box regression, and a 5-point facial-landmark regression per anchor location.
3. For each stride, anchor center points are generated (or pulled from a cache) and combined with the regressed distances to produce actual box coordinates (`distance2bbox`) and landmark coordinates (`distance2kps`), in `backend/app/utils/helpers.py`.
4. Boxes below `conf_thres` (0.5) are discarded; the rest go through greedy NMS (`iou_thres` 0.4) to remove duplicate/overlapping boxes.
5. Coordinates are rescaled back from the 640×640 letterboxed space to the original image's pixel coordinates.

Output: a list of `[x1, y1, x2, y2, score]` boxes plus a matching list of 5-point landmarks (`[[left_eye, right_eye, nose, mouth_left, mouth_right]]` per face), in original-image pixel space.

- `/enroll` calls `detector.detect(frame, max_num=1)` — only the largest/most confident face is kept, since one enrollment photo should contain one person.
- `/recognize` calls `detector.detect(frame, max_num=0)` — all detected faces are kept.

If no face is found, `/enroll` returns HTTP 422; `/recognize` returns an empty `faces` list.

### Step 3 — Align + embed (ArcFace-MobileFace)
For each detected face, `ArcFace.get_embedding()` (`backend/app/models/arcface.py`):
1. **Alignment**: the 5 landmarks from SCRFD are matched against a fixed reference template (the canonical ArcFace 112×112 face layout) using a similarity transform (`estimate_norm` in `helpers.py`, via `skimage.transform.SimilarityTransform`). The transform is applied with `cv2.warpAffine`, producing a 112×112 crop where the eyes/nose/mouth sit in a standardized position regardless of the face's original pose, size, or rotation in the frame. This alignment step is what makes the embedding robust to camera angle.
2. **Preprocessing**: the aligned crop is normalized ((pixel − 127.5) / 127.5, BGR→RGB) and converted to the NCHW blob the ONNX model expects.
3. **Inference**: one forward pass through `w600k_mbf.onnx` produces a 512-dimensional float embedding — a numeric "fingerprint" of that face. Faces of the same person, even in different photos, produce vectors that point in a similar direction; different people produce vectors that point in different directions.

### Step 4a — Enroll: store the embedding
`FaceDatabase.add_face()` (`backend/app/database/faiss_db.py`):
1. The 512-d embedding is L2-normalized (divided by its own magnitude) so its length is exactly 1.
2. It's added to a FAISS `IndexFlatIP` (inner-product index) alongside the employee's name in a parallel Python list.
3. Both the FAISS index and the name list are immediately persisted to disk (`face_database.index` + `face_database_names.json`) so the enrollment survives a server restart.
4. The name is also written to the SQLite `employees` table for the `/employees` listing.

Why normalize + inner product instead of raw Euclidean distance? For unit-length vectors, the inner product of two vectors *is* their cosine similarity — a value from -1 (opposite) to 1 (identical direction). This is the standard similarity metric for ArcFace embeddings.

### Step 4b — Recognize: search + identify
`FaceDatabase.batch_search()`:
1. All query embeddings from the current frame are L2-normalized the same way.
2. A single FAISS batch search compares every query against every stored vector in one call, returning each query's single nearest neighbor (highest cosine similarity) and its similarity score.
3. **Identification rule**: if the best match's similarity ≥ `SIMILARITY_THRESH` (0.4, `backend/app/main.py`), the face is labeled with that stored name and `matched: true`. Below 0.4 (or if the database is empty), it's labeled `"Unknown"` with `matched: false`. This threshold is the same default used by the reference pipeline (`yakhyo/face-reidentification`) — it's a tunable knob: lower = more lenient (more false matches), higher = stricter (more missed matches).
4. Every `matched: true` face triggers `AttendanceDB.log_attendance()`, which writes a `(name, timestamp)` row to SQLite — but only if the same name wasn't already logged within the last 5 minutes (`ATTENDANCE_COOLDOWN_SECONDS`), preventing a spam of rows while someone sits in frame.

The API response for `/recognize` is a JSON list of:
```json
{ "box": [x, y, w, h], "name": "Jane Doe", "confidence": 0.87, "matched": true }
```
`box` is converted from SCRFD's `[x1, y1, x2, y2]` to `[x, y, width, height]` here, since that's the format the frontend draws with.

## 3. How the rectangle gets drawn (frontend)

This part never touches the models — it's pure canvas drawing in `frontend/src/LiveAttendanceTab.jsx`, using the `box`/`name`/`matched` fields the backend already computed.

1. Every 400ms, the visible `<video>` frame is drawn onto a hidden, native-resolution `<canvas>` (`captureCanvasRef`) and exported as a JPEG blob — this is the image sent to `/recognize`.
2. The **overlay** `<canvas>` (the one the user sees, positioned exactly on top of the `<video>`) is sized in pixels to the video's native resolution (`video.videoWidth`/`videoHeight`), then stretched to fill the same CSS box as the video via `width: 100%; height: 100%`. Because both elements share the same CSS footprint, a box drawn at native-resolution coordinates lands in the correct visual position regardless of how much the browser scales the video down on screen.
3. On each response, `drawResults()`:
   - Clears the entire overlay canvas (`clearRect`) — this is what stops old boxes from lingering when a face leaves the frame.
   - For each face, strokes a rectangle at `[x, y, w, h]` — green (`#2ecc71`) if `matched`, red (`#e74c3c`) if not.
   - Writes the name (or `"Unknown"`) as text just below the box, in the same color.

So "detection" (finding a face at all) and "identification" (deciding *whose* face it is) are both fully resolved server-side before the frontend ever draws anything — the browser is just a dumb renderer for boxes + labels the backend already decided.

## 4. End-to-end summary

```
Enroll:    JPEG → decode → SCRFD detect (1 face) → align to 112×112 →
           ArcFace embed (512-d) → normalize → add to FAISS + SQLite → save to disk

Recognize: JPEG → decode → SCRFD detect (all faces) → align each →
           ArcFace embed each → normalize → FAISS batch search (cosine sim) →
           threshold @ 0.4 → name or "Unknown" → log attendance (5-min cooldown) →
           JSON boxes → frontend draws rectangles + labels on canvas
```
