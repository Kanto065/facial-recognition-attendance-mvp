import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Camera as CameraIcon, Loader2, ScanFace } from 'lucide-react';
import { api } from '@/lib/api';

interface PersonType { id: string; name: string; category: string }

const Enroll = () => {
  const { toast } = useToast();
  const [fullName, setFullName] = useState('');
  const [category, setCategory] = useState<'internal' | 'external'>('internal');
  const [personTypeId, setPersonTypeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const typesQuery = useQuery({ queryKey: ['person-types'], queryFn: () => api.get<PersonType[]>('/api/person-types') });
  const types = (typesQuery.data?.data ?? []).filter((t) => t.category === category);

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPickedFile = (newFile: File | null) => {
    setFile(newFile);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return newFile ? URL.createObjectURL(newFile) : null;
    });
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err) {
      setCameraError(`Could not access webcam: ${(err as Error).message}`);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPickedFile(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
        stopCamera();
      },
      'image/jpeg',
      0.9
    );
  };

  const resetForm = () => {
    setFullName('');
    setCategory('internal');
    setPersonTypeId('');
    setPickedFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !file) {
      toast({ title: 'Validation Error', description: 'Name and a face photo are required.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('fullName', fullName.trim());
      formData.append('category', category);
      if (personTypeId) formData.append('personTypeId', personTypeId);
      formData.append('image', file);

      const result = await api.upload('/api/enroll', formData);
      toast({ title: 'Enrolled', description: result.message || `Enrolled "${fullName.trim()}" successfully.` });
      resetForm();
    } catch (err) {
      toast({ title: 'Enrollment failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Enroll Person</h1>
        <p className="text-muted-foreground">Capture a face photo and register a new person for recognition.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScanFace className="w-5 h-5" />New Enrollment</CardTitle>
          <CardDescription>One clear, front-facing photo per person. Re-enroll to replace it later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" required disabled={submitting} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={(v: 'internal' | 'external') => { setCategory(v); setPersonTypeId(''); }} disabled={submitting}>
                  <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="personTypeId">Type</Label>
                <Select value={personTypeId || '__none'} onValueChange={(v) => setPersonTypeId(v === '__none' ? '' : v)} disabled={submitting}>
                  <SelectTrigger id="personTypeId"><SelectValue placeholder="No type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No type</SelectItem>
                    {types.map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Face Photo *</Label>
              <Input type="file" accept="image/*" onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)} disabled={submitting} />

              <div className="flex items-center gap-2 pt-2">
                {!cameraOn ? (
                  <Button type="button" variant="outline" onClick={startCamera} disabled={submitting}>
                    <CameraIcon className="w-4 h-4 mr-2" />Use Camera
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={stopCamera}>Cancel Camera</Button>
                )}
              </div>
              {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}

              {cameraOn && (
                <div className="space-y-2">
                  <video ref={videoRef} muted playsInline className="w-full max-w-xs rounded-md bg-black" />
                  <Button type="button" onClick={capturePhoto}>Capture Photo</Button>
                </div>
              )}

              {previewUrl && !cameraOn && (
                <img src={previewUrl} alt="Selected face" className="w-40 h-32 object-cover rounded-md border" />
              )}
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enrolling...</>) : 'Enroll'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Enroll;
