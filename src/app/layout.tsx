import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "contextlab — plan your context window",
  description:
    "See what fits in a model's context window, what gets cut when it does not, and what it costs. Runs entirely in the browser.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
