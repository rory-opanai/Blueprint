import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blueprint TAS Command Center",
  description: "Manager-ready TAS command center with evidence-grounded approvals"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
