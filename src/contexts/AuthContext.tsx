import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { UserProfileRow } from "@/types/profile";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfileRow | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    department: string
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfileRow | null>;
  /** Reload session + profile from Supabase (e.g. after sign-up returns a session). */
  refreshAuthSession: () => Promise<UserProfileRow | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<UserProfileRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserProfileRow;
}

/** When DB trigger / seed skipped — uses RLS insert policy for operators only. */
async function bootstrapOperatorProfile(user: User): Promise<UserProfileRow | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const metaName =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const metaDept =
    typeof user.user_metadata?.department === "string" ? user.user_metadata.department.trim() : "";
  const fullName =
    metaName ||
    user.email?.split("@")[0]?.trim() ||
    "User";

  const { error } = await supabase.from("user_profiles").insert({
    user_id: user.id,
    full_name: fullName,
    department: metaDept,
    role: "operator",
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") return fetchProfile(user.id);
    return null;
  }
  return fetchProfile(user.id);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuthSession = useCallback(async (sess: Session | null): Promise<UserProfileRow | null> => {
    setSession(sess);
    const u = sess?.user ?? null;
    setUser(u);
    if (u) {
      setLoading(true);
      let row = await fetchProfile(u.id);
      if (!row) row = await bootstrapOperatorProfile(u);
      setProfile(row);
      setLoading(false);
      return row;
    }
    setProfile(null);
    setLoading(false);
    return null;
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await applyAuthSession(data.session ?? null);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, sess) => {
      void applyAuthSession(sess);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applyAuthSession]);

  const refreshAuthSession = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return applyAuthSession(data.session ?? null);
  }, [applyAuthSession]);

  const refreshProfile = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data: authData } = await supabase.auth.getUser();
    const u = authData?.user;
    if (!u) return null;
    let row = await fetchProfile(u.id);
    if (!row) row = await bootstrapOperatorProfile(u);
    setProfile(row);
    return row;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { error: new Error("Workspace is not configured.") };
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: new Error(error.message) };
      await applyAuthSession(data.session ?? null);
      return { error: null };
    },
    [applyAuthSession]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, department: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { error: new Error("Workspace is not configured.") };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            department: department.trim(),
          },
        },
      });
      return { error: error ? new Error(error.message) : null };
    },
    []
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    await applyAuthSession(null);
  }, [applyAuthSession]);

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshAuthSession,
    }),
    [session, user, profile, loading, signIn, signUp, signOut, refreshProfile, refreshAuthSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
