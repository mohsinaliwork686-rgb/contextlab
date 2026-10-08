"use client"

import { useState } from "react"

import { encodeState, isTooLongForUrl, type SharedState } from "@/lib/share"

type Notice = { kind: "ok" | "long" | "error"; text: string } | null

/**
 * Share the current view.
 *
 * A link when it fits; a file when it would not survive being pasted. The page says
 * which happened rather than handing over a link that breaks in a chat client.
 */
export function ShareControls({ state }: { state: SharedState }) {
  const [notice, setNotice] = useState<Notice>(null)

  async function copyLink() {
    try {
      const encoded = await encodeState(state)
      if (isTooLongForUrl(encoded)) {
        setNotice({
          kind: "long",
          text: "Too long to share as a link without it breaking when pasted. Download it as a file instead.",
        })
        return
      }
      const url = new URL(window.location.href)
      url.search = ""
      url.searchParams.set("s", encoded)
      window.history.replaceState(null, "", url)
      await navigator.clipboard.writeText(url.toString())
      setNotice({ kind: "ok", text: "Link copied." })
    } catch {
      setNotice({ kind: "error", text: "Could not copy the link. Your browser may block clipboard access." })
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = href
    anchor.download = "contextlab-request.json"
    anchor.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-page hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--series-1)]"
        >
          Copy link
        </button>
        <button
          type="button"
          onClick={downloadJson}
          className="rounded-md border border-[var(--border)] bg-surface px-3 py-1.5 text-sm text-ink hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--series-1)]"
        >
          Download JSON
        </button>
      </div>
      <p role="status" className="mt-2 min-h-[1rem] text-xs text-ink-2">
        {notice?.text ?? ""}
      </p>
    </div>
  )
}
