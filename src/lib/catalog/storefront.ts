import "server-only";

import { getSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import {
  buildStorefrontCatalog,
  getFallbackStorefrontCatalog,
  type StorefrontCatalog,
} from "./storefront-mapper";

export type { StorefrontCatalog } from "./storefront-mapper";

export async function getStorefrontCatalog(): Promise<StorefrontCatalog> {
  try {
    const supabase = await createClient();
    const api = supabase.schema("api");
    const [categories, items, groups, options, links] = await Promise.all([
      api
        .from("storefront_categories")
        .select("id,slug,parent_id,sort_order,locale,name"),
      api.from("storefront_items").select(
        "id,slug,base_price_minor,is_available,is_featured,sort_order,locale,name,description,category_id,image_bucket,image_path,image_alt",
      ),
      api.from("storefront_modifier_groups").select(
        "id,slug,minimum_selections,maximum_selections,sort_order,locale,name,presentation",
      ),
      api.from("storefront_modifier_options").select(
        "id,group_id,price_delta_minor,sort_order,locale,name",
      ),
      api
        .from("storefront_item_modifier_groups")
        .select("item_id,group_id,sort_order"),
    ]);

    if (
      categories.error ||
      items.error ||
      groups.error ||
      options.error ||
      links.error
    ) {
      return getFallbackStorefrontCatalog();
    }

    return buildStorefrontCatalog(
      {
        categories: categories.data,
        items: items.data,
        groups: groups.data,
        options: options.data,
        links: links.data,
      },
      getSupabaseConfig().url,
    );
  } catch {
    return getFallbackStorefrontCatalog();
  }
}
