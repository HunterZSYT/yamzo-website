export type GoogleReview = {
  id: string;
  rating: number;
  text: string;
  relativePublishedAt: string;
  authorName: string;
  authorUri: string | null;
  authorPhotoUri: string | null;
  googleMapsUri: string;
  translated: boolean;
};

export type GoogleReviewSnapshot = {
  source: "live" | "fallback";
  rating: number;
  reviewCount: number;
  googleMapsUri: string;
  reviews: GoogleReview[];
};
