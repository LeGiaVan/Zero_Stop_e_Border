import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthSignUp() {
  const { signUp, refreshAuthSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    setPending(true);
    const { error } = await signUp(
      email.trim(),
      password,
      fullName.trim(),
      department.trim()
    );
    setPending(false);
    if (error) {
      const msg = error.message;
      const lower = msg.toLowerCase();
      const friendly =
        lower.includes("already registered") || lower.includes("user already")
          ? "An account with this email already exists. Sign in instead."
          : msg.length > 140
            ? "Unable to create account. Please try again."
            : msg;
      toast.error(friendly);
      return;
    }
    await refreshAuthSession();
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase!.auth.getSession();
    if (data.session) {
      toast.success("Welcome to your workspace.");
      navigate("/", { replace: true });
      return;
    }
    toast.success("Confirm your email if prompted, then sign in.");
    navigate("/login", { replace: true });
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border/60 shadow-card">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-semibold tracking-tight">Create account</CardTitle>
        <CardDescription>
          New operators register here. Inspectors and administrators are assigned by your organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Cooper"
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Import operations"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organization.com"
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">At least 6 characters.</p>
          </div>
          <Button type="submit" className="w-full bg-gradient-ocean shadow-glow" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
