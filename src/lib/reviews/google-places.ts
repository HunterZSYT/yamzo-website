import "server-only";

import { z } from "zod";

import type { GoogleReviewSnapshot } from "./types";

const fallbackSnapshot: GoogleReviewSnapshot = {
  source: "fallback",
  rating: 4.8,
  reviewCount: 32,
  googleMapsUri: "https://www.google.com/search?q=Yamzo+Uttara+reviews",
  reviews: [],
};

const localizedTextSchema = z.object({
  text: z.string().trim().min(1),
  languageCode: z.string().optional(),
});

const placeSchema = z.object({
  id: z.string().min(1),
  rating: z.number().min(1).max(5),
  userRatingCount: z.number().int().nonnegative(),
  googleMapsUri: z.string().url(),
  reviews: z
    .array(
      z.object({
        name: z.string().optional(),
        rating: z.number().min(1).max(5),
        text: localizedTextSchema.optional(),
        originalText: localizedTextSchema.optional(),
        relativePublishTimeDescription: z.string().default(""),
        googleMapsUri: z.string().url(),
        authorAttribution: z.object({
          displayName: z.string().trim().min(1),
          uri: z.string().url().optional(),
          photoUri: z.string().url().optional(),
        }),
      }),
    )
    .default([]),
});

function trustedAuthorPhoto(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "googleusercontent.com" ||
        url.hostname.endsWith(".googleusercontent.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function getGoogleReviewSnapshot(): Promise<GoogleReviewSnapshot> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const placeId = process.env.GOOGLE_PLACES_PLACE_ID?.trim();
  if (!apiKey || !placeId) return fallbackSnapshot;

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en&regionCode=BD`,
      {
        cache: "no-store",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "id,rating,userRatingCount,googleMapsUri,reviews",
        },
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) return fallbackSnapshot;

    const parsed = placeSchema.safeParse(await response.json());
    if (!parsed.success) return fallbackSnapshot;

    const reviews = parsed.data.reviews
      .filter((review) => review.rating === 5 && Boolean(review.text?.text))
      .slice(0, 5)
      .map((review, index) => ({
        id: review.name ?? `${parsed.data.id}:review:${index}`,
        rating: review.rating,
        text: review.text!.text,
        relativePublishedAt: review.relativePublishTimeDescription,
        authorName: review.authorAttribution.displayName,
        authorUri: review.authorAttribution.uri ?? null,
        authorPhotoUri: trustedAuthorPhoto(
          review.authorAttribution.photoUri,
        ),
        googleMapsUri: review.googleMapsUri,
        translated:
          Boolean(review.originalText) &&
          review.originalText?.text !== review.text?.text,
      }));

    return {
      source: "live",
      rating: parsed.data.rating,
      reviewCount: parsed.data.userRatingCount,
      googleMapsUri: parsed.data.googleMapsUri,
      reviews,
    };
  } catch {
    return fallbackSnapshot;
  }
}
