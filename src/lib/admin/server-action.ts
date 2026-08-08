import "server-only";

import { getSiteAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function authorizeAdminMutation(permission: string) {
  const access = await getSiteAccess();
  const staff = access.viewer.staff;

  if (
    !access.viewer.isAuthenticated ||
    !staff ||
    staff.status !== "active" ||
    !staff.permissions.includes(permission)
  ) {
    return null;
  }

  return {
    actorId: staff.staff_id,
    client: await createClient(),
  };
}
