import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface EventRow {
  id: string;
  personName: string | null;
  cameraName: string;
  zoneName: string;
  accessLevel: 'full' | 'partial' | 'none';
  decision: 'allowed' | 'flagged' | 'denied';
  confidence: number;
  occurredAt: string;
}

const DECISION_STYLES: Record<string, string> = {
  allowed: 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10',
  flagged: 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-500/10',
  denied: 'border-red-500 text-red-700 dark:text-red-400 bg-red-500/10',
};

const Live = () => {
  const eventsQuery = useQuery({
    queryKey: ['events', 'recent'],
    queryFn: () => api.get<EventRow[]>('/api/events/recent?limit=50'),
    refetchInterval: 2000,
  });
  const events = eventsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Live</h1>
        <p className="text-muted-foreground">Recognition and access events as they happen, across all cameras. Refreshes every 2s.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Radio className="w-5 h-5" />Recent Activity</CardTitle>
          <CardDescription>Start a camera on the Capture page to see events appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No events yet.</p>
          ) : (
            <div className="divide-y">
              {events.map((e) => (
                <div key={e.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{e.personName ?? 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.cameraName} · {e.zoneName} · {new Date(e.occurredAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={cn('text-xs px-2 py-1 rounded-md border capitalize', DECISION_STYLES[e.decision])}>
                    {e.decision}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Live;
