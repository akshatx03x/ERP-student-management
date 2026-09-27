import type { Metadata } from "next";
import { IBM_Plex_Sans, Cinzel, Cinzel_Decorative } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-cinzel",
});

const cinzelDecorative = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-cinzel-decorative",
});

export const metadata: Metadata = {
  title: "Vidyanjali School ERP",
  description: "School management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${ibmPlexSans.variable} ${cinzel.variable} ${cinzelDecorative.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
