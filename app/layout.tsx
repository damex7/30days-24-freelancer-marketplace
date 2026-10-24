import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Header } from "@/components/header";
import { LogoMark } from "@/components/logo";
import "./globals.css";

// Fonts are bundled locally (next/font/local), so builds never depend on a
// font CDN. Fraunces: a soft, characterful serif for headings. Plus Jakarta
// Sans: a clear, friendly sans for everything else.
const fraunces = localFont({ src: "./fonts/Fraunces.woff2", variable: "--font-fraunces", weight: "300 800", display: "swap" });
const jakarta = localFont({ src: "./fonts/PlusJakartaSans.woff2", variable: "--font-jakarta", weight: "300 800", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Gigroom: hire Nigerian freelancers", template: "%s · Gigroom" },
  description: "Post a job, compare proposals, chat and hire skilled Nigerian freelancers.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4B1F7A" },
    { media: "(prefers-color-scheme: dark)", color: "#2B1747" },
  ],
};

// Runs before the first paint: applies a saved light/dark choice so the page
// never flashes the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${fraunces.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-50 rounded-full bg-surface px-4 py-2 font-bold text-brand shadow">
          Skip to content
        </a>
        <Header />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <footer className="border-t border-line bg-surface-2">
          <div className="container-page flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-ink-muted">
            <span className="flex items-center gap-2 font-display text-base font-semibold text-brand">
              <LogoMark className="size-6 text-brand" /> Gigroom
            </span>
            <nav aria-label="Footer" className="flex flex-wrap gap-4">
              <Link className="hover:text-brand" href="/jobs">Find work</Link>
              <Link className="hover:text-brand" href="/freelancers">Find talent</Link>
              <Link className="hover:text-brand" href="/signup">Join</Link>
            </nav>
            <span>Built in Nigeria · Day 24 of 30</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
