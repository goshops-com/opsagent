import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpsAgent Control Panel",
  description: "Monitor and manage your OpsAgent instances",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
