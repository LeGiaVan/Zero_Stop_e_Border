import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import {
  GuestRouteLayout,
  RequireAuthLayout,
  RoleGate,
} from "@/components/auth/RouteGuards";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";
import Dashboard from "./pages/Dashboard";
import Declaration from "./pages/Declaration";
import Verification from "./pages/Verification";
import Tracking from "./pages/Tracking";
import Risk from "./pages/Risk";
import Gate from "./pages/Gate";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound.tsx";
import AuthSignIn from "./pages/AuthSignIn";
import AuthSignUp from "./pages/AuthSignUp";
import AccessDenied from "./pages/AccessDenied";
import HomeRedirect from "./pages/HomeRedirect";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<GuestRouteLayout />}>
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<AuthSignIn />} />
                <Route path="/signup" element={<AuthSignUp />} />
              </Route>
            </Route>

            <Route element={<RequireAuthLayout />}>
              <Route path="/access-denied" element={<AccessDenied />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<HomeRedirect />} />
                <Route
                  path="/declaration"
                  element={
                    <RoleGate allow={["operator"]}>
                      <Declaration />
                    </RoleGate>
                  }
                />
                <Route
                  path="/verification"
                  element={
                    <RoleGate allow={["inspector", "viewer"]}>
                      <Verification />
                    </RoleGate>
                  }
                />
                <Route
                  path="/tracking"
                  element={
                    <RoleGate allow={["inspector", "viewer"]}>
                      <Tracking />
                    </RoleGate>
                  }
                />
                <Route
                  path="/risk"
                  element={
                    <RoleGate allow={["inspector", "viewer"]}>
                      <Risk />
                    </RoleGate>
                  }
                />
                <Route
                  path="/gate"
                  element={
                    <RoleGate allow={["inspector", "viewer"]}>
                      <Gate />
                    </RoleGate>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RoleGate adminOnly>
                      <Admin />
                    </RoleGate>
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
