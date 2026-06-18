import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TravelAI — Smart Trip Planner",
  description:
    "Describe your dream journey in plain English. Our AI agent searches, plans, and books your entire trip — flights, hotels, and activities — automatically.",
  keywords: ["travel", "AI", "trip planner", "flights", "hotels", "itinerary"],
  openGraph: {
    title: "TravelAI — Smart Trip Planner",
    description: "Describe your dream journey. Our AI handles the rest.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
