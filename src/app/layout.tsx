import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/components/Providers";
import Nav from "@/components/Nav";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const SITE_URL = process.env.NEXTAUTH_URL ?? "https://www.uniqassess.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "UNIQAssess — AI-Era Professional Assessment",
    template: "%s | UNIQAssess",
  },
  description:
    "Competency simulations for professional hiring. Assess how candidates direct AI, not just what they write.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    type: "website",
    siteName: "UNIQAssess",
    title: "UNIQAssess — Hire for judgement, not for prompts.",
    description:
      "Scenario-based competency simulations for the AI era. Memo work, live AI tools, blind marking with reveal.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "UNIQAssess — Hire for judgement, not for prompts.",
    description:
      "Scenario-based competency simulations for the AI era. Memo work, live AI tools, blind marking with reveal.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 min-h-screen`}
      >
        <Providers>
          <Nav />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
