import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Enroll from "./pages/Enroll";
import Capture from "./pages/Capture";
import Persons from "./pages/Persons";
import Zones from "./pages/Zones";
import Cameras from "./pages/Cameras";
import Access from "./pages/Access";
import Live from "./pages/Live";
import Events from "./pages/Events";
import ChangePassword from "./pages/ChangePassword";
import DashboardLayout from "./layouts/DashboardLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="enroll" element={<Enroll />} />
                <Route path="capture" element={<Capture />} />
                <Route path="persons" element={<Persons />} />
                <Route path="zones" element={<Zones />} />
                <Route path="cameras" element={<Cameras />} />
                <Route path="access" element={<Access />} />
                <Route path="live" element={<Live />} />
                <Route path="events" element={<Events />} />
                <Route path="change-password" element={<ChangePassword />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
