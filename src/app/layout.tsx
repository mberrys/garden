import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "rr — generative workspace",
  description:
    "A combined text editor, PDF client, presentation editor and drawing canvas with a local AI collaborator.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Applied before paint so the app never flashes the wrong theme on load.
const THEME_BOOTSTRAP = `
try {
  var stored = localStorage.getItem('rr.theme');
  var dark = stored ? stored === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
