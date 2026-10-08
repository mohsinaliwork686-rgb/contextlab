"use client"

import type { LayerAllocation } from "@/lib/budget"
import type { CountMethod } from "@/lib/models"
import type { LayerSpec } from "@/lib/layers"
import { formatTokens } from "@/lib/tokenizer"

const CONTEXT_CHARS = 160
const DROPPED_CHARS = 260

/**
 * Where the knife falls.
 *
 * Shows the boundary between what is dropped and what survives, with a little of each
 * either side, so the reader sees the exact sentence that gets cut. A greyed overlay on
 * the textarea itself was the first idea; it means keeping a backdrop's font metrics,
 * padding and scroll position in lockstep with a native control across browsers, and a
 * boundary view answers the same question without any of that.
 */
function CutPreview({ text, entry, method }: { text: string; entry: LayerAllocation; method: CountMethod }) {
  const fromStart = entry.keptFrom > 0
  const dropped = fromStart ? text.slice(0, entry.keptFrom) : text.slice(entry.keptTo)
  const kept = text.slice(entry.keptFrom, entry.keptTo)

  const droppedShown = fromStart ? dropped.slice(-DROPPED_CHARS) : dropped.slice(0, DROPPED_CHARS)
  const keptShown = fromStart ? kept.slice(0, CONTEXT_CHARS) : kept.slice(-CONTEXT_CHARS)
  const hiddenDropped = dropped.length - droppedShown.length

  return (
    <div className="mt-2 rounded-md border border-[var(--border)] bg-page p-3 text-xs">
      <p className="mb-2 text-ink-2">
        <span className="font-medium text-ink">
          {formatTokens({ tokens: entry.dropped, method })} tokens dropped
        </span>{" "}
        from the {fromStart ? "start — the oldest part" : "end — the weakest part"}.{" "}
        {kept.length === 0 ? "Nothing in this layer survives." : "The cut falls here:"}
      </p>
      <pre className="m-0 whitespace-pre-wrap break-words font-sans leading-relaxed">
        {fromStart ? (
          <>
            {hiddenDropped > 0 ? <span className="text-ink-3">…</span> : null}
            <del className="text-ink-3 decoration-[var(--status-critical)]">{droppedShown}</del>
            {keptShown ? <span className="text-ink">{keptShown}</span> : null}
            {kept.length > keptShown.length ? <span className="text-ink-3">…</span> : null}
          </>
        ) : (
          <>
            {kept.length > keptShown.length ? <span className="text-ink-3">…</span> : null}
            {keptShown ? <span className="text-ink">{keptShown}</span> : null}
            <del className="text-ink-3 decoration-[var(--status-critical)]">{droppedShown}</del>
            {hiddenDropped > 0 ? <span className="text-ink-3">…</span> : null}
          </>
        )}
      </pre>
    </div>
  )
}

interface LayerEditorProps {
  spec: LayerSpec
  text: string
  entry: LayerAllocation | undefined
  method: CountMethod
  onChange: (value: string) => void
}

export function LayerEditor({ spec, text, entry, method, onChange }: LayerEditorProps) {
  const fieldId = `layer-${spec.id}`
  const tokens = entry?.tokens ?? 0

  return (
    <section className="rounded-lg border border-[var(--border)] bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={fieldId} className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: spec.color }} />
            {spec.label}
          </label>
          <p id={`${fieldId}-hint`} className="mt-0.5 text-xs text-ink-3">{spec.hint}</p>
        </div>
        <span className="tabular shrink-0 text-sm text-ink-2" aria-live="polite">
          {formatTokens({ tokens, method })}
        </span>
      </div>

      <textarea
        id={fieldId}
        aria-describedby={`${fieldId}-hint`}
        value={text}
        placeholder={spec.placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={spec.id === "history" || spec.id === "retrieved" ? 6 : 4}
        spellCheck={false}
        className="mt-3 block w-full resize-y rounded-md border border-[var(--border)] bg-page p-2.5 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-[var(--series-1)]"
      />

      {entry && entry.dropped > 0 ? <CutPreview text={text} entry={entry} method={method} /> : null}
    </section>
  )
}
