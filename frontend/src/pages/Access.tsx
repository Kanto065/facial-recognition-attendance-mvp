import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MatrixData {
  persons: { id: string; fullName: string }[];
  zones: { id: string; name: string }[];
  rules: { id: string; personId: string; zoneId: string; accessLevel: 'full' | 'partial' | 'none' }[];
}

const LEVEL_STYLES: Record<string, string> = {
  full: 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10',
  partial: 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-500/10',
  none: 'border-red-500 text-red-700 dark:text-red-400 bg-red-500/10',
};

const Access = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const matrixQuery = useQuery({ queryKey: ['access-rules'], queryFn: () => api.get<MatrixData>('/api/access-rules') });
  const data = matrixQuery.data?.data;

  const updateMutation = useMutation({
    mutationFn: (payload: { personId: string; zoneId: string; accessLevel: string }) => api.put('/api/access-rules', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['access-rules'] }),
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  if (matrixQuery.isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading access matrix...</p>
        </div>
      </div>
    );
  }

  const levelFor = (personId: string, zoneId: string) =>
    data.rules.find((r) => r.personId === personId && r.zoneId === zoneId)?.accessLevel ?? 'none';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Access</h1>
        <p className="text-muted-foreground">
          Per-person, per-zone access level. Green = full access, yellow = partial, red = not allowed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />Access Matrix</CardTitle>
          <CardDescription>Unset pairs default to "none" until explicitly granted.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.persons.length === 0 || data.zones.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {data.persons.length === 0 ? 'Enroll a person' : 'Create a zone'} to start assigning access.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 font-medium sticky left-0 bg-card">Person</th>
                    {data.zones.map((z) => (
                      <th key={z.id} className="text-left py-2 px-2 font-medium whitespace-nowrap">{z.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.persons.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2 pr-4 font-medium whitespace-nowrap sticky left-0 bg-card">{p.fullName}</td>
                      {data.zones.map((z) => {
                        const level = levelFor(p.id, z.id);
                        return (
                          <td key={z.id} className="py-2 px-2">
                            <Select
                              value={level}
                              onValueChange={(v) => updateMutation.mutate({ personId: p.id, zoneId: z.id, accessLevel: v })}
                            >
                              <SelectTrigger className={cn('w-28 h-8 text-xs border', LEVEL_STYLES[level])}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full">Full</SelectItem>
                                <SelectItem value="partial">Partial</SelectItem>
                                <SelectItem value="none">None</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Access;
