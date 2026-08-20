import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Radio, Video as VideoIcon, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface CameraRow {
  id: string; zoneId: string; zoneName: string | null; name: string;
  sourceType: 'rtsp' | 'browser'; enabled: boolean;
}

interface FaceResult {
  box: [number, number, number, number];
  matched: boolean;
  confidence: number;
  personId: string | null;
  fullName: string | null;
  accessLevel: 'full' | 'partial' | 'none' | null;
  decision: 'allowed' | 'flagged' | 'denied' | null;
}

const POLL_INTERVAL_MS = 700;

const DECISION_COLOR: Record<string, string> = {
  allowed: '#22c55e',
  flagged: '#eab308',
  denied: '#ef4444',
};
const UNMATCHED_COLOR = '#9ca3af';

const Capture = () => {
  const [cameraId, setCameraId] = useState<string>('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<FaceResult[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const camerasQuery = useQuery({ queryKey: ['cameras'], queryFn: () => api.get<CameraRow[]>('/api/cameras') });
  const browserCameras = (camerasQuery.data?.data ?? []).filter((c) => c.sourceType === 'browser');

  useEffect(() => {
    return () => stopStreaming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawOverlay = (results: FaceResult[]) => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const face of results) {
      const [x, y, w, h] = face.box;
      const color = face.matched && face.decision ? DECISION_COLOR[face.decision] : UNMATCHED_COLOR;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      const label = face.matched ? `${face.fullName} (${face.decision})` : 'Unknown';
      ctx.font = '16px sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - 22), textWidth + 10, 22);
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 5, Math.max(16, y - 5));
    }
  };

  const pollFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || inFlightRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        inFlightRef.current = true;
        try {
          const formData = new FormData();
          formData.append('image', blob, 'frame.jpg');
          const result = await api.upload<{ faces: FaceResult[] }>(`/api/cameras/${cameraId}/recognize`, formData);
          const detected = result.data?.faces ?? [];
          setFaces(detected);
          drawOverlay(detected);
        } catch (err) {
          // transient errors (e.g. a dropped frame) shouldn't stop the loop
          console.error('recognize failed', err);
        } finally {
          inFlightRef.current = false;
        }
      },
      'image/jpeg',
      0.8
    );
  };

  const startStreaming = async () => {
    setError(null);
    if (!cameraId) {
      setError('Select a camera first.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
      intervalRef.current = window.setInterval(pollFrame, POLL_INTERVAL_MS);
    } catch (err) {
      setError(`Could not access webcam: ${(err as Error).message}`);
    }
  };

  const stopStreaming = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
    setFaces([]);
  };

  const selectedCamera = browserCameras.find((c) => c.id === cameraId);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Capture</h1>
        <p className="text-muted-foreground">
          Stream this device's webcam as a registered camera. Open this page on each device you want acting as a
          zone camera, pick which camera it represents, and start streaming.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><VideoIcon className="w-5 h-5" />This Device's Camera</CardTitle>
          <CardDescription>
            {browserCameras.length === 0
              ? 'No browser-webcam cameras registered yet — add one on the Cameras page with Source = "Browser webcam".'
              : 'Choose which registered camera this device is acting as.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={cameraId} onValueChange={setCameraId} disabled={streaming || camerasQuery.isLoading}>
            <SelectTrigger><SelectValue placeholder="Select a camera" /></SelectTrigger>
            <SelectContent>
              {browserCameras.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} — {c.zoneName ?? 'No zone'}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedCamera && (
            <p className="text-xs text-muted-foreground">
              Zone: <span className="font-medium">{selectedCamera.zoneName ?? 'None'}</span>
            </p>
          )}

          {!streaming ? (
            <Button onClick={startStreaming} disabled={!cameraId || camerasQuery.isLoading}>
              {camerasQuery.isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />}
              Start Streaming
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopStreaming}>Stop Streaming</Button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="relative w-full max-w-xl">
            <video ref={videoRef} muted playsInline className={streaming ? 'w-full rounded-md bg-black' : 'hidden'} />
            <canvas ref={overlayRef} className={streaming ? 'absolute top-0 left-0 w-full h-full pointer-events-none' : 'hidden'} />
          </div>

          {streaming && (
            <div className="text-xs text-muted-foreground">
              {faces.length === 0 ? 'No faces currently detected.' : `${faces.length} face(s) detected — see overlay for identity/decision.`}
            </div>
          )}

          {streaming && faces.some((f) => f.matched) && (
            <div className="flex flex-wrap gap-2">
              {faces.filter((f) => f.matched).map((f, i) => (
                <Badge
                  key={i}
                  className="text-xs"
                  style={{ backgroundColor: f.decision ? DECISION_COLOR[f.decision] : UNMATCHED_COLOR, color: '#000' }}
                >
                  {f.fullName} — {f.decision}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Capture;
