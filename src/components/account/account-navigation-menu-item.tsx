import { CircleUserRound } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type AccountNavigationMenuItemProps = {
  isAuthenticated: boolean;
  nextPath: string;
  onNavigate?: () => void;
};

export function getAccountNavigationHref(
  isAuthenticated: boolean,
  nextPath: string,
): string {
  return isAuthenticated
    ? "/account"
    : `/login?next=${encodeURIComponent(nextPath)}`;
}

/**
 * Shared public-menu item. The header owns its layout while this component
 * keeps the signed-in destination and wording consistent everywhere.
 */
export function AccountNavigationMenuItem({
  isAuthenticated,
  nextPath,
  onNavigate,
}: AccountNavigationMenuItemProps) {
  const destination = getAccountNavigationHref(isAuthenticated, nextPath);

  return (
    <Button asChild className="h-12 justify-start px-4 font-bold">
      <Link href={destination} onClick={onNavigate}>
        <CircleUserRound aria-hidden="true" />
        {isAuthenticated ? "Profile" : "Sign in"}
      </Link>
    </Button>
  );
}
