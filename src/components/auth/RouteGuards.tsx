import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/profile";

export function AuthLoadingScreen() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}

export function GuestRouteLayout() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function RequireAuthLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

interface RoleGateProps {
  children: ReactNode;
  /** When true, only admins may access this route. */
  adminOnly?: boolean;
  /** Roles allowed besides admin (admins always pass). */
  allow?: UserRole[];
}

export function RoleGate({ children, adminOnly, allow }: RoleGateProps) {
  const { profile, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!profile) return <Navigate to="/" replace />;
  const role = profile.role;
  if (adminOnly) {
    if (role !== "admin") return <Navigate to="/access-denied" replace />;
    return <>{children}</>;
  }
  if (role === "admin") return <>{children}</>;
  if (allow?.includes(role)) return <>{children}</>;
  return <Navigate to="/access-denied" replace />;
}
