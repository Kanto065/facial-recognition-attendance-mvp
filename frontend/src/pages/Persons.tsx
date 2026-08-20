import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Edit, UserX, Loader2, Users, ScanFace } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';

interface PersonType { id: string; name: string; category: string }
interface PersonRow {
  id: string; fullName: string; category: 'internal' | 'external'; personTypeId: string | null;
  personTypeName: string | null; status: 'active' | 'inactive'; faceEnrolled: boolean;
}

type FormState = { fullName: string; category: 'internal' | 'external'; personTypeId: string; status: 'active' | 'inactive' };

const Persons = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<PersonRow | null>(null);
  const [form, setForm] = useState<FormState>({ fullName: '', category: 'internal', personTypeId: '', status: 'active' });

  const personsQuery = useQuery({ queryKey: ['persons'], queryFn: () => api.get<PersonRow[]>('/api/persons') });
  const persons = personsQuery.data?.data ?? [];

  const typesQuery = useQuery({ queryKey: ['person-types'], queryFn: () => api.get<PersonType[]>('/api/person-types') });
  const types = typesQuery.data?.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['persons'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Omit<FormState, never> & { personTypeId: string | null } }) =>
      api.put(`/api/persons/${id}`, payload),
    onSuccess: () => { toast({ title: 'Success', description: 'Person updated.' }); invalidate(); resetForm(); },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/persons/${id}`),
    onSuccess: () => { toast({ title: 'Success', description: 'Person deactivated.' }); invalidate(); },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
    onSettled: () => setDeactivateTarget(null),
  });

  const handleEdit = (p: PersonRow) => {
    setEditing(p);
    setForm({ fullName: p.fullName, category: p.category, personTypeId: p.personTypeId ?? '', status: p.status });
    setIsDialogOpen(true);
  };

  const resetForm = () => { setEditing(null); setIsDialogOpen(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    updateMutation.mutate({
      id: editing.id,
      payload: { ...form, personTypeId: form.personTypeId || null },
    });
  };

  if (personsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading persons...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Persons</h1>
          <p className="text-muted-foreground">Everyone enrolled for recognition — internal staff, contractors, visitors, or vendors.</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/enroll"><ScanFace className="w-4 h-4 mr-2" />Enroll New Person</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Persons ({persons.length})</CardTitle>
          <CardDescription>Set per-zone access from the Access page</CardDescription>
        </CardHeader>
        <CardContent>
          {persons.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No persons enrolled yet.</p>
              <Button asChild><Link to="/dashboard/enroll">Enroll New Person</Link></Button>
            </div>
          ) : (
            <div className="divide-y">
              {persons.map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {p.fullName}
                      <Badge variant="secondary" className="text-xs capitalize">{p.category}</Badge>
                      {p.personTypeName && <Badge variant="outline" className="text-xs capitalize">{p.personTypeName}</Badge>}
                      {p.status === 'inactive' && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.faceEnrolled ? 'Face enrolled' : 'No face on file'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}><Edit className="w-4 h-4" /></Button>
                    {p.status === 'active' && (
                      <Button variant="ghost" size="icon" onClick={() => setDeactivateTarget(p)}><UserX className="w-4 h-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Person</DialogTitle>
            <DialogDescription>Update category, type, or status. Re-enroll from the Enroll page to update the face on file.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input id="fullName" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required disabled={updateMutation.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={form.category} onValueChange={(v: 'internal' | 'external') => setForm((f) => ({ ...f, category: v }))} disabled={updateMutation.isPending}>
                <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="personTypeId">Type</Label>
              <Select value={form.personTypeId || '__none'} onValueChange={(v) => setForm((f) => ({ ...f, personTypeId: v === '__none' ? '' : v }))} disabled={updateMutation.isPending}>
                <SelectTrigger id="personTypeId"><SelectValue placeholder="No type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No type</SelectItem>
                  {types.map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v: 'active' | 'inactive') => setForm((f) => ({ ...f, status: v }))} disabled={updateMutation.isPending}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm} disabled={updateMutation.isPending}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate "{deactivateTarget?.fullName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              They're marked inactive rather than deleted, so attendance/access history is preserved. Their face stays
              on file — reactivate them here later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Persons;
