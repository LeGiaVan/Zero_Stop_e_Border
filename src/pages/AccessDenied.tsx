import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/profile";

function homePathForRole(role: UserRole): string {
  if (role === "operator") return "/declaration";
  if (role === "admin") return "/admin";
  return "/";
}

export default function AccessDenied() {
  const navigate = useNavigate();
  const { profile, signOut, refreshAuthSession, loading } = useAuth();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  async function handleRetryProfile() {
    const row = await refreshAuthSession();
    navigate("/", { replace: true });
    if (!row) {
      toast.error("Unable to load your account profile. Try again or contact support.");
    }
  }

  function handleHome() {
    if (profile) {
      navigate(homePathForRole(profile.role), { replace: true });
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="w-full max-w-md rounded-2xl border-border/60 shadow-card text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ShieldOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Access restricted</CardTitle>
          <CardDescription>
            {profile
              ? "Your role does not include this area of the application."
              : "Use Home to open the workspace recovery screen, or sign out."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {!profile && (
            <Button variant="secondary" type="button" disabled={loading} onClick={() => void handleRetryProfile()}>
              Reload profile
            </Button>
          )}
          <Button variant="outline" type="button" disabled={loading} onClick={() => void handleHome()}>
            Home
          </Button>
          <Button variant="ghost" type="button" disabled={loading} onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
