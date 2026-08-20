import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { History } from 'lucide-react';

const Events = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Events</h1>
      <p className="text-muted-foreground">Historical attendance and access log, filterable by person, zone, camera, and date.</p>
    </div>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="w-5 h-5" />Coming in M4</CardTitle>
        <CardDescription>
          Backed by the attendance_events and access_events tables — populated once camera ingestion (M2/M3) starts
          logging recognition and access decisions. See docs/warehouse-architecture.md for the milestone plan.
        </CardDescription>
      </CardHeader>
    </Card>
  </div>
);

export default Events;
