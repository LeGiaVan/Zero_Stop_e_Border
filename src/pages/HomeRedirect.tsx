import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Dashboard from "@/pages/Dashboard";
import { AuthLoadingScreen } from "@/components/auth/RouteGuards";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

function ProfileMissingNotice() {
  const navigate = useNavigate();
  const { refreshAuthSession, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const row = await refreshAuthSession();
      if (!row) {
        toast.error("Unable to load your account profile. Try again or contact support.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <Card className="w-full max-w-md rounded-2xl border-border/60 shadow-card">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Finish workspace setup</CardTitle>
          <CardDescription>
            You are signed in, but your user profile was not found or could not be created.
            Try again, or sign out and contact your administrator.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button className="bg-gradient-ocean shadow-glow" disabled={busy} onClick={() => void retry()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try again"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function HomeRedirect() {
  const { profile, loading, user } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <ProfileMissingNotice />;
  if (profile.role === "operator") return <Navigate to="/declaration" replace />;
  return <Dashboard />;
}
