import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rezo — resolve disputes without the back and forth",
  description:
    "Rezo settles customer disputes end to end: evidence verified live against a challenge, " +
    "your policy applied clause by clause, refunds executed under limits you set. " +
    "Every decision explained.",
  openGraph: {
    title: "Rezo — autonomous dispute resolution",
    description:
      "Evidence verified live, your policy applied clause by clause, refunds under limits you set.",
    type: "website",
  },
};

/**
 * The theme is applied before first paint. Doing it in an effect would show a
 * light flash to anyone who chose dark, which is the kind of detail people
 * notice without being able to name.
 */
const THEME_BOOTSTRAP = `
  try {
    if (localStorage.getItem("rezo-theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans text-base antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
