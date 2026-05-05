import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthSignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const { error } = await signIn(email.trim(), password);
    setPending(false);
    if (error) {
      const msg = error.message;
      const lower = msg.toLowerCase();
      const friendly =
        lower.includes("invalid login credentials") || lower.includes("invalid credentials")
          ? "Incorrect email or password."
          : lower.includes("email not confirmed")
            ? "Confirm your email address before signing in."
            : msg.length > 140
              ? "Unable to sign in. Please try again."
              : msg;
      toast.error(friendly);
      return;
    }
    toast.success("Signed in successfully.");
    navigate(from, { replace: true });
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border/60 shadow-card">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-semibold tracking-tight">Sign in</CardTitle>
        <CardDescription>
          Enter your work email and password to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-background"
            />
          </div>
          <Button type="submit" className="w-full bg-gradient-ocean shadow-glow" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to the workspace?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>

        <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-sm">
          <p className="mb-2 font-medium">Demo Accounts</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  <th className="font-medium pb-2 pr-4">Role</th>
                  <th className="font-medium pb-2 pr-4">Email</th>
                  <th className="font-medium pb-2">Password</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium">Customs</td>
                  <td className="pr-4">haiquan@gmail.com</td>
                  <td>123456789</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">Business</td>
                  <td className="pr-4">legiavan0210@gmail.com</td>
                  <td>123456</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">Admin</td>
                  <td className="pr-4">admin@gmail.com</td>
                  <td>123456</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
