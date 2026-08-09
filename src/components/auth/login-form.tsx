"use client";

import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  nextPath: string;
  supabaseConfigured: boolean;
  googleAuthEnabled: boolean;
};

type Step = "email" | "code";

const verificationCodePattern = /^\d{6,8}$/;
const verificationCodeMaxLength = 8;

function getFriendlyAuthError(): string {
  return "We could not complete that sign-in request. Please check your details and try again.";
}

export function LoginForm({
  nextPath,
  supabaseConfigured,
  googleAuthEnabled,
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
      setNotice(`A verification code was sent to ${email.trim()}.`);
    } catch {
      setError(getFriendlyAuthError());
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!verificationCodePattern.test(code)) {
      setError("Enter the complete verification code from your email.");
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

  return (
    <Card className="auth-card gap-0 py-0" aria-busy={busy || undefined}>
      <CardHeader className="auth-card-header">
        <div className="auth-card-heading">
          <span className="auth-icon" aria-hidden="true">
            <ShieldCheck />
          </span>
          <div>
            <p className="auth-eyebrow">Secure access</p>
            <h1>Welcome to Yamzo</h1>
          </div>
        </div>
        <CardDescription className="auth-description">
          Sign in to save your details and order history. Approved staff can
          also preview the website while it is under construction.
        </CardDescription>
      </CardHeader>

      <CardContent className="auth-card-content">
        <FieldGroup className="auth-form">
          {googleAuthEnabled ? (
            <>
              <GoogleSignInButton
                nextPath={nextPath}
                className="auth-google-button"
                disabled={busy}
                onAttempt={() => setError(null)}
                onError={setError}
              >
                Continue with Google
              </GoogleSignInButton>
              <FieldSeparator>or use email</FieldSeparator>
            </>
          ) : null}

          {step === "email" ? (
            <form
              onSubmit={sendCode}
              className="auth-form"
              aria-busy={busy || undefined}
            >
              <Field>
                <FieldLabel htmlFor="email">Email address</FieldLabel>
                <InputGroup className="h-12 bg-white">
                  <InputGroupAddon aria-hidden="true">
                    <Mail />
                  </InputGroupAddon>
                  <InputGroupInput
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
                </InputGroup>
                <FieldDescription>
                  We&apos;ll email you a one-time code—no password needed.
                </FieldDescription>
              </Field>
              <Button
                type="submit"
                size="lg"
                className="min-h-12 w-full"
                disabled={busy}
              >
                {busy ? <Spinner aria-hidden="true" /> : null}
                Send sign-in code
              </Button>
            </form>
          ) : (
            <form
              onSubmit={verifyCode}
              className="auth-form"
              aria-busy={busy || undefined}
            >
              <Field>
                <FieldLabel htmlFor="code">Verification code</FieldLabel>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,8}"
                  maxLength={verificationCodeMaxLength}
                  required
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, verificationCodeMaxLength),
                    )
                  }
                  className="auth-code-input"
                  placeholder="00000000"
                  disabled={busy}
                />
                <FieldDescription>
                  Enter the 6 to 8 digit code exactly as it appears in your email.
                </FieldDescription>
              </Field>
              <Button
                type="submit"
                size="lg"
                className="min-h-12 w-full"
                disabled={busy}
              >
                {busy ? <Spinner aria-hidden="true" /> : <CheckCircle2 />}
                Verify and continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
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
            {error ? <FieldError className="auth-error">{error}</FieldError> : null}
            {notice ? <p className="auth-success">{notice}</p> : null}
          </div>
        </FieldGroup>

        <Button asChild variant="ghost" className="auth-back-link">
          <Link href="/">
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            Back to Yamzo
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
