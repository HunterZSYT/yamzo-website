"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type GoogleSignInButtonProps = {
  nextPath: string;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
  onAttempt?: () => void;
  onError?: (message: string) => void;
};

export function GoogleMark() {
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

export function GoogleSignInButton({
  nextPath,
  className,
  disabled = false,
  children = "Continue with Google",
  onAttempt,
  onError,
}: GoogleSignInButtonProps) {
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    if (busy || disabled) return;

    onAttempt?.();
    setBusy(true);

    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", nextPath);

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (error) throw error;
    } catch {
      setBusy(false);
      onError?.(
        "We could not complete that sign-in request. Please check your details and try again.",
      );
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={cn("w-full", className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={signInWithGoogle}
    >
      {busy ? <Spinner aria-hidden="true" /> : <span className="google-mark" aria-hidden="true"><GoogleMark /></span>}
      {busy ? "Opening Google…" : children}
    </Button>
  );
}
