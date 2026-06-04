import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sustainability Cell" },
      { name: "description", content: "Sign in to the Group Sustainability Cell dashboard." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-auth-gradient flex items-center justify-center px-4">
      <div className="blob" style={{ width: 420, height: 420, background: "oklch(0.55 0.2 255)", top: -100, left: -80 }} />
      <div className="blob" style={{ width: 340, height: 340, background: "oklch(0.62 0.16 150)", bottom: -80, right: -60, animationDelay: "-4s" }} />
      <div className="blob" style={{ width: 260, height: 260, background: "oklch(0.7 0.14 220)", top: "40%", left: "55%", animationDelay: "-8s" }} />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-10 backdrop-blur-2xl shadow-glow">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient text-2xl shadow-glow">
          🌱
        </div>
        <h1 className="text-center text-2xl font-semibold text-white">Sustainability Cell</h1>
        <p className="mb-8 mt-1 text-center text-sm text-white/60">
          {mode === "signin" ? "Sign in to access the dashboard" : "Create your account"}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white/80" htmlFor="email">Email</Label>
            <Input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="border-white/15 bg-white/10 text-white placeholder:text-white/40"
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80" htmlFor="password">Password</Label>
            <Input
              id="password" type="password" required minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="border-white/15 bg-white/10 text-white placeholder:text-white/40"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-brand-gradient text-primary-foreground hover:opacity-90">
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 w-full text-center text-sm text-white/70 hover:text-white"
        >
          {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
