import type { Metadata } from "next";

import { AccountClient } from "@/components/account/account-client";
import { getAccountPageData } from "@/lib/account/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your profile",
  description: "Manage your Yamzo Uttara profile, saved delivery details, and orders.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const account = await getAccountPageData();

  return <AccountClient email={account.email} snapshot={account.snapshot} />;
}
