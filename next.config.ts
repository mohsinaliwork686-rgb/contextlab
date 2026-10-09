import type { NextConfig } from "next"

// A static export. The whole app runs in the browser, so the build is plain files any
// static host can serve. On GitHub Pages it lives under /contextlab, which the deploy
// workflow passes in; locally and in the browser tests it is served from the root.
const basePath = process.env.PAGES_BASE_PATH || undefined

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
}

export default nextConfig
