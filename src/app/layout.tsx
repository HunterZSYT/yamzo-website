import type { Metadata } from "next";
import { Manrope, Noto_Sans_Bengali } from "next/font/google";

import { AnalyticsConsent } from "@/components/analytics/analytics-consent";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getMetaPixelId } from "@/lib/meta/capi-server";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://yamzouttara.com"),
  title: {
    default: "Yamzo Uttara | Seafood delivery in Uttara",
    template: "%s | Yamzo Uttara",
  },
  description:
    "Order Yamzo seafood favourites for delivery across Uttara with simple checkout and live order tracking.",
  applicationName: "Yamzo Uttara",
  openGraph: {
    type: "website",
    locale: "en_BD",
    siteName: "Yamzo Uttara",
    title: "Yamzo Uttara",
    description: "Taste the fun, dive into flavor.",
    images: [
      {
        url: "/brand/yamzo-cover.png",
        width: 2048,
        height: 768,
        alt: "Yamzo Uttara underwater seafood illustration",
      },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const metaPixelId = await getMetaPixelId();

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${notoSansBengali.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
        <MetaPixel pixelId={metaPixelId} />
        <AnalyticsConsent enabled={Boolean(metaPixelId)} />
      </body>
    </html>
  );
}
