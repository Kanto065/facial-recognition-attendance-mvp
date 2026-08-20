import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Video } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';

interface ZoneRow { id: string; name: string }
interface CameraRow {
  id: string; zoneId: string; zoneName: string | null; name: string; rtspUrl: string; enabled: boolean; samplingFps: number;
}

type FormState = { zoneId: string; name: string; rtspUrl: string; enabled: boolean; samplingFps: string };
const emptyForm: FormState = { zoneId: '', name: '', rtspUrl: '', enabled: true, samplingFps: '1.5' };

const Cameras = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CameraRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CameraRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const zonesQuery = useQuery({ queryKey: ['zones'], queryFn: () => api.get<ZoneRow[]>('/api/zones') });
  const zones = zonesQuery.data?.data ?? [];

  const camerasQuery = useQuery({ queryKey: ['cameras'], queryFn: () => api.get<CameraRow[]>('/api/cameras') });
  const cameras = camerasQuery.data?.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cameras'] });

  const toPayload = (f: FormState) => ({
    zoneId: f.zoneId,
    name: f.name,
    rtspUrl: f.rtspUrl,
    enabled: f.enabled,
    samplingFps: parseFloat(f.samplingFps) || 1.5,
  });

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) => api.post('/api/cameras', payload),
    onSuccess: () => { toast({ title: 'Success', description: 'Camera added.' }); invalidate(); resetForm(); },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof toPayload> }) => api.put(`/api/cameras/${id}`, payload),
    onSuccess: () => { toast({ title: 'Success', description: 'Camera updated.' }); invalidate(); resetForm(); },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/cameras/${id}`),
    onSuccess: () => { toast({ title: 'Success', description: 'Camera removed.' }); invalidate(); },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
    onSettled: () => setDeleteTarget(null),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.rtspUrl.trim() || !form.zoneId) {
      toast({ title: 'Validation Error', description: 'Name, RTSP URL, and zone are required.', variant: 'destructive' });
      return;
    }
    const payload = toPayload(form);
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (c: CameraRow) => {
    setEditing(c);
    setForm({ zoneId: c.zoneId, name: c.name, rtspUrl: c.rtspUrl, enabled: c.enabled, samplingFps: String(c.samplingFps) });
    setIsDialogOpen(true);
  };

  const resetForm = () => { setForm(emptyForm); setEditing(null); setIsDialogOpen(false); };
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (camerasQuery.isLoading || zonesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading cameras...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cameras</h1>
          <p className="text-muted-foreground">
            Register an RTSP feed and assign it to a zone. Demo cameras (office PC webcams bridged via mediamtx/ffmpeg) work the same way — see docs/warehouse-architecture.md.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : resetForm())}>
          <DialogTrigger asChild>
            <Button disabled={zones.length === 0} onClick={() => { setEditing(null); setIsDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />Add Camera
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
              <DialogDescription>rtsp://host:port/stream — same shape for a real IP camera or a demo webcam bridge.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Camera Name *</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Dock Camera 1" required disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zoneId">Zone *</Label>
                <Select value={form.zoneId} onValueChange={(v) => setForm((f) => ({ ...f, zoneId: v }))} disabled={isSubmitting}>
                  <SelectTrigger id="zoneId"><SelectValue placeholder="Select a zone" /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rtspUrl">RTSP URL *</Label>
                <Input id="rtspUrl" value={form.rtspUrl} onChange={(e) => setForm((f) => ({ ...f, rtspUrl: e.target.value }))} placeholder="rtsp://192.168.1.50:8554/cam1" required disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="samplingFps">Sampling FPS</Label>
                <Input id="samplingFps" type="number" step="0.1" min="0.1" value={form.samplingFps} onChange={(e) => setForm((f) => ({ ...f, samplingFps: e.target.value }))} disabled={isSubmitting} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="enabled">Enabled</Label>
                <Switch id="enabled" checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} disabled={isSubmitting} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : editing ? 'Update Camera' : 'Add Camera'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {zones.length === 0 && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Create a zone first before adding cameras.</CardContent></Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Cameras ({cameras.length})</CardTitle>
          <CardDescription>Live ingestion/recognition against these feeds lands in M2/M3</CardDescription>
        </CardHeader>
        <CardContent>
          {cameras.length === 0 ? (
            <div className="text-center py-12">
              <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No cameras registered yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {cameras.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {c.name}
                      {!c.enabled && <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.zoneName ?? 'No zone'} · {c.rtspUrl} · {c.samplingFps} fps</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This stops ingestion from this camera. This can't be undone from here.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Cameras;
