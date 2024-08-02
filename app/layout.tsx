import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";

import "./globals.css";

export const metadata: Metadata = {
  title: "Chat With PDF",
  description: "AI app for your PDF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen h-screen overflow-hidden flex flex-col">
          <Toaster />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
