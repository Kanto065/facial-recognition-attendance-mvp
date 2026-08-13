import { useEffect, useRef, useState } from "react";
import { recognizeFrame } from "./api";

const POLL_INTERVAL_MS = 400;

// Smoothing so a single borderline frame doesn't flip a face between a name
// and "Unknown". Faces are matched frame-to-frame by box-center proximity,
// then the displayed label is a majority vote over recent history for that face.
const HISTORY_SIZE = 5;
const MIN_VOTES = 2;
const MATCH_DISTANCE_PX = 90;
const TRACK_TIMEOUT_MS = 1500;

export default function LiveAttendanceTab() {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(document.createElement("canvas"));
  const inFlightRef = useRef(false);
  const tracksRef = useRef([]);
  const [error, setError] = useState(null);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    let stream;
    let cancelled = false;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (playErr) {
            if (playErr.name === "AbortError") return;
            throw playErr;
          }
          if (!cancelled) setStreaming(true);
        }
      } catch (err) {
        if (!cancelled) setError(`Could not access webcam: ${err.message}`);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!streaming) return;

    const intervalId = setInterval(async () => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.videoWidth === 0) return;
      if (inFlightRef.current) return;

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width;
        overlay.height = height;
      }

      const captureCanvas = captureCanvasRef.current;
      captureCanvas.width = width;
      captureCanvas.height = height;
      const captureCtx = captureCanvas.getContext("2d");
      captureCtx.drawImage(video, 0, 0, width, height);

      captureCanvas.toBlob(
        async (blob) => {
          if (!blob) return;
          inFlightRef.current = true;
          try {
            const result = await recognizeFrame(blob);
            const smoothed = updateTracks(tracksRef.current, result.faces || []);
            drawResults(overlay, smoothed);
          } catch (err) {
            // Transient errors (e.g. backend momentarily unavailable) are non-fatal; skip this frame.
          } finally {
            inFlightRef.current = false;
          }
        },
        "image/jpeg",
        0.8
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [streaming]);

  function updateTracks(tracks, faces) {
    const now = Date.now();
    const unclaimed = new Set(tracks);
    const results = [];

    for (const face of faces) {
      const [x, y, w, h] = face.box;
      const cx = x + w / 2;
      const cy = y + h / 2;

      let best = null;
      let bestDist = MATCH_DISTANCE_PX;
      for (const track of unclaimed) {
        const dist = Math.hypot(track.cx - cx, track.cy - cy);
        if (dist < bestDist) {
          best = track;
          bestDist = dist;
        }
      }

      const track = best || { history: [] };
      unclaimed.delete(track);
      track.cx = cx;
      track.cy = cy;
      track.lastSeen = now;
      track.history.push({ name: face.name, matched: face.matched });
      if (track.history.length > HISTORY_SIZE) track.history.shift();

      let displayName = face.matched ? face.name : "Unknown";
      let displayMatched = face.matched;

      if (track.history.length >= MIN_VOTES) {
        const votes = {};
        for (const entry of track.history) {
          if (!entry.matched) continue;
          votes[entry.name] = (votes[entry.name] || 0) + 1;
        }
        let bestName = null;
        let bestCount = 0;
        for (const [voteName, count] of Object.entries(votes)) {
          if (count > bestCount) {
            bestName = voteName;
            bestCount = count;
          }
        }
        if (bestCount >= MIN_VOTES) {
          displayName = bestName;
          displayMatched = true;
        } else {
          displayName = "Unknown";
          displayMatched = false;
        }
      }

      if (!best) tracks.push(track);
      results.push({ box: face.box, name: displayName, matched: displayMatched });
    }

    for (let i = tracks.length - 1; i >= 0; i--) {
      if (now - tracks[i].lastSeen > TRACK_TIMEOUT_MS) tracks.splice(i, 1);
    }

    return results;
  }

  function drawResults(canvas, faces) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    faces.forEach(({ box, name, matched }) => {
      const [x, y, w, h] = box;
      ctx.strokeStyle = matched ? "#2ecc71" : "#e74c3c";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      const label = matched ? name : "Unknown";
      ctx.font = "16px sans-serif";
      const textY = y + h + 20;
      ctx.fillStyle = matched ? "#2ecc71" : "#e74c3c";
      ctx.fillText(label, x, textY);
    });
  }

  return (
    <div>
      <h2>Live Attendance</h2>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <div style={{ position: "relative", width: 640, height: 480 }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        />
        <canvas
          ref={overlayRef}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
