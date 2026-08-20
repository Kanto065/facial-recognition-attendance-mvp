import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Users, MapPin, Video, Loader2, Calendar } from 'lucide-react';

interface PersonRow { id: string; status: string }
interface ZoneRow { id: string; cameraCount: number }
interface CameraRow { id: string; enabled: boolean }

const Dashboard = () => {
  const personsQuery = useQuery({ queryKey: ['persons'], queryFn: () => api.get<PersonRow[]>('/api/persons') });
  const zonesQuery = useQuery({ queryKey: ['zones'], queryFn: () => api.get<ZoneRow[]>('/api/zones') });
  const camerasQuery = useQuery({ queryKey: ['cameras'], queryFn: () => api.get<CameraRow[]>('/api/cameras') });

  const isLoading = personsQuery.isLoading || zonesQuery.isLoading || camerasQuery.isLoading;

  const persons = personsQuery.data?.data ?? [];
  const zones = zonesQuery.data?.data ?? [];
  const cameras = camerasQuery.data?.data ?? [];
  const activePersons = persons.filter((p) => p.status === 'active').length;
  const enabledCameras = cameras.filter((c) => c.enabled).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Warehouse facial recognition & zone access overview.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enrolled Persons</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Users className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{activePersons}</div>
            <p className="text-xs text-muted-foreground mt-1">{persons.length} total (incl. inactive)</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Zones</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><MapPin className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{zones.length}</div>
            <p className="text-xs text-muted-foreground mt-1">configured warehouse zones</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cameras</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Video className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{enabledCameras} / {cameras.length}</div>
            <p className="text-xs text-muted-foreground mt-1">enabled cameras</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Live activity & event history</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Real-time recognition/access events and the historical log land here once camera ingestion (M2/M3) and the
          websocket event feed (M4) are wired up — see the <span className="font-medium">Live</span> and{' '}
          <span className="font-medium">Events</span> pages.
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
