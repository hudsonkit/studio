import type { Metadata } from "next";
import { getHudsonThemeScript } from "hudsonkit/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "A spatial design environment for product flows, interface studies, and engineering notes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: getHudsonThemeScript({
              storageKey: "studio.theme",
              defaultTheme: "dark",
              defaultTemplate: "hudson",
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
