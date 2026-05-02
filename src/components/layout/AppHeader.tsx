import { Bell, Search, Globe2, ChevronDown, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AppHeader() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const displayName = profile?.full_name ?? "User";
  const subtitle = profile ? formatRole(profile.role) : "";

  return (
    <header className="h-16 shrink-0 bg-card border-b border-border flex items-center px-6 gap-4 sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search shipments, declarations, HS codes…"
          className="pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
        />
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <Globe2 className="h-4 w-4" />
          <span className="hidden lg:inline">EN</span>
        </Button>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
        </Button>

        <div className="h-8 w-px bg-border mx-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 hover:bg-muted/60 rounded-lg pl-1 pr-2 py-1 transition-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="h-9 w-9 rounded-full bg-gradient-ocean flex items-center justify-center text-white font-semibold text-sm shadow-md">
                {initials(displayName)}
              </div>
              <div className="hidden md:block text-left leading-tight">
                <div className="text-sm font-semibold text-foreground">{displayName}</div>
                <div className="text-[11px] text-muted-foreground">{subtitle}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {profile?.department ? (
              <>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">{profile.department}</div>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/">Workspace home</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                void (async () => {
                  await signOut();
                  navigate("/login", { replace: true });
                })();
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
