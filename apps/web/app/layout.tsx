import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "YANTRA — Autonomous Spec-to-Ship Agent",
  description: "Describe it. Approve it. Ship it. YANTRA turns a plain-English spec into a GitHub PR — autonomously.",
  keywords: ["AI", "code generation", "GitHub", "pull request", "autonomous agent"],
  openGraph: {
    title: "YANTRA",
    description: "Describe it. Approve it. Ship it.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${GeistSans.variable} ${GeistMono.variable}`}
        suppressHydrationWarning
      >
        <body className="bg-zinc-950 text-zinc-50 antialiased">
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#18181b",
                border: "1px solid #3f3f46",
                color: "#fafafa",
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  )
}
