"use client";

import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  nextPath: string;
  supabaseConfigured: boolean;
};

type Step = "email" | "code";

function getFriendlyAuthError(): string {
  return "We could not complete that sign-in request. Please check your details and try again.";
}

export function LoginForm({
  nextPath,
  supabaseConfigured,
}: LoginFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!supabaseConfigured) {
      setError("Sign-in is still being configured. Please try again later.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (authError) {
        setError(getFriendlyAuthError());
        return;
      }

      setStep("code");
      setNotice(`A 6-digit sign-in code was sent to ${email.trim()}.`);
    } catch {
      setError(getFriendlyAuthError());
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code)) {
      setError("Enter the complete 6-digit code from your email.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "email",
      });

      if (authError) {
        setError("That code is invalid or has expired. Request a new code.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError(getFriendlyAuthError());
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);

    if (!supabaseConfigured) {
      setError("Google sign-in is still being configured.");
      return;
    }

    setBusy(true);
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", nextPath);

      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (authError) {
        setError(getFriendlyAuthError());
        setBusy(false);
      }
    } catch {
      setError(getFriendlyAuthError());
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-card-heading">
        <span className="auth-icon" aria-hidden="true">
          <ShieldCheck />
        </span>
        <div>
          <p className="auth-eyebrow">Secure access</p>
          <h1>Welcome to Yamzo</h1>
        </div>
      </div>
      <p className="auth-description">
        Sign in to save your details and order history. Approved staff can also
        preview the website while it is under construction.
      </p>

      <Button
        type="button"
        variant="outline"
        className="auth-google-button"
        disabled={busy}
        onClick={signInWithGoogle}
      >
        <span className="google-mark" aria-hidden="true">
          G
        </span>
        Continue with Google
      </Button>

      <div className="auth-divider">
        <Separator />
        <span>or use email</span>
        <Separator />
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="auth-form">
          <div className="auth-field">
            <Label htmlFor="email">Email address</Label>
            <div className="auth-input-wrap">
              <Mail aria-hidden="true" />
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={busy}
              />
            </div>
            <p className="auth-helper">
              We&apos;ll email you a one-time code—no password needed.
            </p>
          </div>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Spinner aria-hidden="true" /> : null}
            Send sign-in code
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="auth-form">
          <div className="auth-field">
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="auth-code-input"
              placeholder="000000"
              disabled={busy}
            />
          </div>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Spinner aria-hidden="true" /> : <CheckCircle2 />}
            Verify and continue
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setNotice(null);
            }}
          >
            Use a different email
          </Button>
        </form>
      )}

      <div className="auth-message" aria-live="polite" aria-atomic="true">
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-success">{notice}</p> : null}
      </div>

      <Button asChild variant="ghost" className="auth-back-link">
        <Link href="/">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Back to Yamzo
        </Link>
      </Button>
    </div>
  );
}
