import { LayoutDashboard, LogOut, User, Lock, ScanFace, Users, MapPin, Video, ShieldCheck, Radio, History, Sun, Moon, Webcam } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const menuItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Enroll', url: '/dashboard/enroll', icon: ScanFace },
  { title: 'Capture', url: '/dashboard/capture', icon: Webcam },
  { title: 'Persons', url: '/dashboard/persons', icon: Users },
  { title: 'Zones', url: '/dashboard/zones', icon: MapPin },
  { title: 'Cameras', url: '/dashboard/cameras', icon: Video },
  { title: 'Access', url: '/dashboard/access', icon: ShieldCheck },
  { title: 'Live', url: '/dashboard/live', icon: Radio },
  { title: 'Events', url: '/dashboard/events', icon: History },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar className={collapsed ? 'w-14' : 'w-64'} collapsible="icon">
      <SidebarContent>
        <div className="px-4 py-6">
          {collapsed ? (
            <div className="flex justify-center">
              <SidebarTrigger />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0">
                <ScanFace className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg truncate">Face Detection System</h2>
                <p className="text-xs text-muted-foreground">Admin Panel</p>
              </div>
              <SidebarTrigger className="shrink-0" />
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/dashboard'}
                      className={({ isActive }) =>
                        isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {user && !collapsed && (
          <>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex-1 min-w-0 px-4 py-2 flex items-center gap-3 hover:bg-sidebar-accent rounded-lg transition-colors">
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium truncate">{user.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.role}</p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/dashboard/change-password')}>
                    <Lock className="mr-2 h-4 w-4" />
                    <span>Change Password</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost" size="icon" className="shrink-0"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
            <Separator />
          </>
        )}
        {collapsed && (
          <>
            <Button variant="ghost" size="icon" className="w-full" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </>
        )}
        {!user && !collapsed && (
          <Button variant="ghost" className="w-full justify-start" onClick={logout}>
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
