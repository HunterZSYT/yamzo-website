import "server-only";

import { redirect } from "next/navigation";

import { accountSnapshotSchema, type AccountSnapshot } from "@/lib/account/contracts";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AccountPageData = {
  email: string;
  snapshot: AccountSnapshot | null;
};

function redirectToLogin(): never {
  redirect("/login?next=%2Faccount");
}

/**
 * Account data is deliberately fetched through one security-definer RPC. This
 * avoids ever granting the browser direct access to private phone/address PII.
 */
export async function getAccountPageData(): Promise<AccountPageData> {
  if (!hasSupabaseConfig()) redirectToLogin();

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) redirectToLogin();

  const { data, error } = await supabase
    .schema("api")
    .rpc("get_my_account_snapshot");
  const snapshot = error ? null : accountSnapshotSchema.safeParse(data);

  return {
    email: user.email,
    snapshot: snapshot && snapshot.success ? snapshot.data : null,
  };
}
