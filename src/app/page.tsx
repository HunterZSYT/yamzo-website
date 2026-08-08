import type { Metadata } from "next";

import { ComingSoon } from "@/components/site/coming-soon";
import { Storefront } from "@/components/storefront/storefront";
import { getSiteAccess } from "@/lib/auth/access";
import { getStorefrontCatalog } from "@/lib/catalog/storefront";
import { getGoogleReviewSnapshot } from "@/lib/reviews/google-places";
import { getStorefrontMerchandising } from "@/lib/storefront/merchandising";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const access = await getSiteAccess();
  const launched = access.runtime.site_published;

  return {
    alternates: { canonical: "/" },
    description: launched
      ? "Order Yamzo seafood favourites for delivery across Uttara and follow live kitchen updates."
      : "Yamzo Uttara online ordering is being prepared for launch.",
    robots: {
      index: launched,
      follow: launched,
    },
  };
}

export default async function Home() {
  const access = await getSiteAccess();

  if (!access.runtime.site_published && !access.viewer.canPreview) {
    return <ComingSoon />;
  }

  const [reviews, catalog, merchandising] = await Promise.all([
    getGoogleReviewSnapshot(),
    getStorefrontCatalog(),
    getStorefrontMerchandising(),
  ]);

  if (catalog.source === "fallback" && !access.viewer.canPreview) {
    return <ComingSoon />;
  }

  return (
    <Storefront
      access={access}
      reviews={reviews}
      catalog={catalog}
      merchandising={merchandising}
    />
  );
}
