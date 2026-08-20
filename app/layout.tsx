import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Casa Morta — Terror e sobrevivência em 2D",
  description: "Sobreviva por 2 minutos e 30 segundos em uma mansão onde a criatura aprende suas rotas e esconderijos.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Casa Morta",
    description: "A casa aprende seus passos. Sobreviva à presença por 2 minutos e 30 segundos.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Casa Morta — A casa aprende seus passos" }],
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Casa Morta",
    description: "A casa aprende seus passos. Sobreviva à presença.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={geistMono.variable}>{children}</body></html>;
}
