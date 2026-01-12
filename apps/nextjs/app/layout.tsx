import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/global.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Client Pix - Photo Gallery",
  description: "Self-hosted photography client gallery",
  icons: {
    icon: "/client_pix_logo.png",
    apple: "/client_pix_logo.png",
  },
  openGraph: {
    images: [
      {
        url: "/client_pix_logo.png",
        alt: "Client Pix",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
