import "server-only";

import { getSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import {
  buildStorefrontMerchandising,
  getFallbackStorefrontMerchandising,
  type StorefrontMerchandising,
} from "./merchandising-mapper";

export type {
  StorefrontBanner,
  StorefrontHomeSection,
  StorefrontMerchandising,
  StorefrontOffer,
} from "./merchandising-mapper";

export async function getStorefrontMerchandising(): Promise<StorefrontMerchandising> {
  try {
    const supabase = await createClient();
    const api = supabase.schema("api");
    const [banners, offers, homeSections] = await Promise.all([
      api.from("storefront_banners").select(
        "id,placement,action_url,sort_order,locale,eyebrow,title,body,action_label,image_bucket,image_path,image_alt",
      ),
      api.from("storefront_offers").select(
        "id,code,kind,value,maximum_discount_minor,minimum_subtotal_minor,starts_at,ends_at,priority,locale,name,description,terms",
      ),
      api.from("storefront_home_sections").select(
        "id,section_key,kind,sort_order,config,locale,title,subtitle",
      ),
    ]);

    if (banners.error || offers.error || homeSections.error) {
      return getFallbackStorefrontMerchandising();
    }

    return buildStorefrontMerchandising(
      {
        banners: banners.data,
        offers: offers.data,
        homeSections: homeSections.data,
      },
      getSupabaseConfig().url,
    );
  } catch {
    return getFallbackStorefrontMerchandising();
  }
}
