import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign-in issue",
  robots: { index: false, follow: false },
};

export default function AuthErrorPage() {
  return (
    <main className="auth-simple-page">
      <section className="auth-simple-card">
        <span className="auth-error-icon" aria-hidden="true">
          <CircleAlert />
        </span>
        <p className="auth-eyebrow">Sign-in interrupted</p>
        <h1>That sign-in link could not be completed.</h1>
        <p>
          The link may have expired or already been used. Start again and we&apos;ll
          send a fresh code.
        </p>
        <Button asChild size="lg">
          <Link href="/login">Try signing in again</Link>
        </Button>
      </section>
    </main>
  );
}
