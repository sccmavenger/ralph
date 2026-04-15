import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";

const GA_MEASUREMENT_ID = "G-NMB36RD355";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MSF Companion — Your Marvel Strike Force Command Center",
  description:
    "The ultimate mobile companion for Marvel Strike Force. Track your roster, plan upgrades, get AI-powered advice, and dominate with real-time war and event data.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: "MSF Companion",
    title: "MSF Companion — Your Marvel Strike Force Command Center",
    description:
      "Track your roster, plan upgrades, get AI-powered advice, and dominate MSF with real-time war and event data. Free to start, Premium from $1.99/mo.",
    url: "https://themsftoolkit.com",
  },
  twitter: {
    card: "summary",
    title: "MSF Companion — Your Marvel Strike Force Command Center",
    description:
      "Track your roster, plan upgrades, get AI-powered advice, and dominate MSF.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
