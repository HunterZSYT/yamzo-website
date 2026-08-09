import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { PublicNavigationMenu } from "@/components/site/public-navigation-menu";
import { getSiteAccess } from "@/lib/auth/access";

export async function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const access = await getSiteAccess();

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_right,rgba(34,168,221,.13),transparent_30%),#f6fbfe]">
      <header className="border-b border-sky-100 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-17 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <Image src="/brand/yamzo-logo.png" alt="Yamzo Uttara" width={44} height={44} className="size-11 rounded-xl object-contain" />
            <span className="text-sm font-black">Yamzo Uttara</span>
          </Link>
          <PublicNavigationMenu
            nextPath="/"
            isAuthenticated={access.viewer.isAuthenticated}
          />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <article className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-[0_20px_60px_rgba(8,42,68,.08)] sm:p-10">
          <p className="text-xs font-extrabold uppercase tracking-[.15em] text-primary">Yamzo Uttara</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-.055em] sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{summary}</p>
          <p className="mt-3 text-xs text-muted-foreground">Last updated 8 August 2026</p>
          <div className="prose prose-slate mt-9 max-w-none space-y-7 text-sm leading-7 text-foreground/82 [&_a]:font-bold [&_a]:text-primary [&_a]:underline [&_h2]:text-xl [&_h2]:font-black [&_h2]:tracking-[-.03em] [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">{children}</div>
        </article>
      </main>
    </div>
  );
}
