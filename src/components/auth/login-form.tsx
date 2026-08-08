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

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" focusable="false">
      <path
        fill="#EA4335"
        d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0782-1.796 2.7155v2.2582h2.9082c1.7027-1.5673 2.6842-3.8741 2.6842-6.6146Z"
      />
      <path
        fill="#4285F4"
        d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1809l-2.9082-2.2582c-.8059.54-1.8368.8591-3.0482.8591-2.3441 0-4.3282-1.5845-5.0368-3.7105H.9568v2.332c1.4809 2.9414 4.5245 4.9595 8.0432 4.9595Z"
      />
      <path
        fill="#FBBC05"
        d="M3.9632 10.7095A5.4172 5.4172 0 0 1 3.6818 9c0-.5932.1018-1.17.2814-1.7095v-2.332H.9568A9 9 0 0 0 0 9c0 1.4523.3477 2.8277.9568 4.0418l3.0064-2.3323Z"
      />
      <path
        fill="#34A853"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4418 1.3459l2.5814-2.5813C13.4632.8918 11.4259 0 9 0 5.4813 0 2.4377 2.0182.9568 4.9586l3.0064 2.3323C4.6718 5.164 6.6559 3.5795 9 3.5795Z"
      />
    </svg>
  );
}

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
          <GoogleMark />
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
