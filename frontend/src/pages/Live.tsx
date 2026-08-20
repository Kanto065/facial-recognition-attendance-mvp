import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Radio } from 'lucide-react';

const Live = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Live</h1>
      <p className="text-muted-foreground">Real-time recognition and access events as they happen across zones.</p>
    </div>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Radio className="w-5 h-5" />Coming in M4</CardTitle>
        <CardDescription>
          This page will stream live events over a websocket (<code>/ws/events</code>) once server-side camera
          ingestion (M2/M3) is producing recognition and access decisions to stream. See
          docs/warehouse-architecture.md for the milestone plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        In the meantime, cameras and zones can be configured from the Cameras and Zones pages, and persons enrolled
        from the Enroll page.
      </CardContent>
    </Card>
  </div>
);

export default Live;
