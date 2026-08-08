import type { Metadata } from "next";
import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";
import { hasSupabaseConfig } from "@/lib/env";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Yamzo Uttara.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = getSafeRedirectPath(rawNext);

  return (
    <main className="auth-page">
      <Image
        src="/brand/yamzo-cover.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="auth-page-cover"
      />
      <div className="auth-page-wash" aria-hidden="true" />
      <div className="auth-brand-panel">
        <Image
          src="/brand/yamzo-logo.png"
          alt="Yamzo"
          width={216}
          height={216}
          className="auth-brand-logo"
        />
        <p>Yamzo Uttara</p>
        <span>Taste the fun, dive into flavor</span>
      </div>
      <LoginForm
        nextPath={nextPath}
        supabaseConfigured={hasSupabaseConfig()}
      />
    </main>
  );
}
