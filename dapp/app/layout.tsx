import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

//<metadata written by AI.>
export const metadata: Metadata = {
  title: "WalletYeet · Yeet the mess. Keep the value.",
  description:
    "AI agents discover, audit, and plan your wallet migration. You choose what goes where. One signature does it all.",
  openGraph: {
    title: "WalletYeet",
    description:
      "Three AI agents discover, audit, and plan your wallet migration; you choose destinations; one signature does it all.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-yeet min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
