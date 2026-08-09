"use client";

import { Menu, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccountNavigationMenuItem } from "@/components/account/account-navigation-menu-item";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type PublicNavigationMenuProps = {
  nextPath: string;
  isAuthenticated: boolean;
};

export function PublicNavigationMenu({
  nextPath,
  isAuthenticated,
}: PublicNavigationMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="min-h-11 min-w-11 border-sky-200 bg-white/80 text-[#06334f] shadow-sm hover:border-sky-300 hover:bg-sky-50"
          aria-label="Open navigation menu"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(22rem,calc(100vw-1.5rem))] border-sky-100 bg-[#f8fcfe] p-0"
      >
        <SheetHeader className="border-b border-sky-100 bg-white px-6 py-7 pr-14">
          <SheetTitle className="text-lg font-black tracking-[-.035em] text-[#06334f]">
            Yamzo Uttara
          </SheetTitle>
          <SheetDescription className="mt-1 leading-5">
            Quick access to your account and order updates.
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Quick links" className="grid gap-2 p-4">
          <Button asChild variant="outline" className="h-12 justify-start border-sky-100 bg-white px-4 font-bold hover:bg-sky-50">
            <Link href="/order-status" onClick={() => setOpen(false)}>
              <PackageSearch aria-hidden="true" />
              Track orders
            </Link>
          </Button>
          <AccountNavigationMenuItem
            isAuthenticated={isAuthenticated}
            nextPath={nextPath}
            onNavigate={() => setOpen(false)}
          />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
