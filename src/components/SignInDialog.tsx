import { useState, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { authClient } from "~/lib/auth-client";
import { api } from "../../convex/_generated/api";
import { clearClientRootRouteContextCache } from "~/lib/root-route-context";
import {
  Loader2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Zap,
  Brain,
  Globe,
  Infinity,
} from "lucide-react";
import { Input } from "~/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODEL_BRANDS = [
  { name: "GPT", color: "#10a37f" },
  { name: "Claude", color: "#d97706" },
  { name: "Gemini", color: "#4285f4" },
  { name: "Grok", color: "#e5e5e5" },
  { name: "DeepSeek", color: "#6366f1" },
  { name: "Llama", color: "#0668E1" },
] as const;

const FEATURES = [
  { icon: Zap, label: "Instant responses" },
  { icon: Brain, label: "Advanced reasoning" },
  { icon: Globe, label: "Web search" },
  { icon: Infinity, label: "Unlimited conversations" },
] as const;

export function SignInDialog({ open, onOpenChange }: SignInDialogProps) {
  const router = useRouter();
  const settings = useQuery(api.admin.getSettings);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reset form state when dialog closes
  useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setEmail("");
        setPassword("");
        setName("");
        setIsSignUp(false);
        setLoading(false);
        setShowPassword(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (result.error) {
          toast.error(result.error.message || "Failed to create account.");
          setLoading(false);
          return;
        }
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          toast.error(result.error.message || "Invalid email or password.");
          setLoading(false);
          return;
        }
      }
      clearClientRootRouteContextCache();
      await router.invalidate();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const signupsLocked = settings?.signupsLocked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="signin-dialog max-w-[440px] gap-0 p-0 overflow-hidden border-0"
      >
        <DialogTitle className="sr-only">Sign in to AgentChat</DialogTitle>
        <DialogDescription className="sr-only">
          Access GPT, Claude, Gemini, Grok, and more, all in one place.
        </DialogDescription>
        {/* ── Hero Section ── */}
        <div className="relative overflow-hidden px-8 pt-8 pb-6">
          {/* Ambient glow orbs */}
          <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-[280px] h-[160px] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_70%)]" />
          <div className="pointer-events-none absolute -top-8 right-0 w-[120px] h-[120px] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,#4285f4_10%,transparent),transparent_70%)]" />
          <div className="pointer-events-none absolute -top-8 left-0 w-[120px] h-[120px] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,#d97706_8%,transparent),transparent_70%)]" />

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 text-center"
          >
            <h2 className="text-[22px] font-bold tracking-tight text-foreground leading-tight">
              Every top AI model.
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-amber-400 bg-clip-text text-transparent">
                One free account.
              </span>
            </h2>
            <p className="mt-2.5 text-[13px] text-muted-foreground leading-relaxed max-w-[300px] mx-auto">
              Access GPT, Claude, Gemini, Grok, and more, all in one place, completely free.
            </p>
          </motion.div>

          {/* Model brand pills */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mt-5 flex flex-wrap items-center justify-center gap-1.5"
          >
            {MODEL_BRANDS.map((brand) => (
              <div
                key={brand.name}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1"
              >
                <div
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: brand.color }}
                />
                <span className="text-[11px] font-medium text-foreground/80">
                  {brand.name}
                </span>
              </div>
            ))}
          </motion.div>

          {/* Feature row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 mt-4 flex items-center justify-center gap-4"
          >
            {FEATURES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1"
              >
                <Icon className="size-3 text-muted-foreground/70" />
                <span className="text-[10px] text-muted-foreground/70 font-medium whitespace-nowrap">
                  {label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Divider ── */}
        <div className="mx-6 h-px bg-border/60" />

        {/* ── Auth Form ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="px-8 pt-5 pb-6"
        >
          <AnimatePresence mode="wait">
            {isSignUp && signupsLocked && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <Lock className="size-4 shrink-0 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      Registration closed
                    </p>
                    <p className="text-xs text-muted-foreground">
                      New account creation is currently disabled.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleAuth} className="space-y-3.5">
            <AnimatePresence mode="wait">
              {isSignUp && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-3.5">
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Name
                    </label>
                    <Input
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      className="h-10 neo-input"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </label>
              <Input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-10 neo-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder={
                    isSignUp ? "Create a password" : "Enter your password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  className="h-10 pr-10 neo-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (isSignUp && signupsLocked)}
              className="neo-button-primary w-full h-11 mt-1 rounded-lg text-sm font-semibold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  {isSignUp ? "Create free account" : "Sign in"}
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setName("");
              }}
              className="font-semibold text-foreground underline-offset-4 hover:underline transition-colors"
            >
              {isSignUp ? "Sign in" : "Create a free account"}
            </button>
          </p>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
