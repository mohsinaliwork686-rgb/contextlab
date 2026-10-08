"use client"

import { useState } from "react"

import type { Allocation } from "@/lib/budget"
import { LAYER_SPECS } from "@/lib/layers"
import { formatTokens } from "@/lib/tokenizer"

/**
 * Which input layer is spending the budget.
 *
 * Scaled to the input itself, not to the context window. On a million-token window a
 * realistic request is a fraction of a percent, so a window-scaled bar would read as
 * empty and say nothing about composition. The window question gets its own meter.
 *
 * The output reserve is left out on purpose. It is usually the single largest number,
 * so including it squeezes every input layer into a sliver at one end — which defeats
 * the only question this bar exists to answer. The reserve is in the meter and the table.
 *
 * Segments are separated by a 2px gap in the surface colour, never by a stroke, and only
 * the two outer ends are rounded.
 */

interface Segment {
  key: string
  label: string
  color: string
  tokens: number
}

export function CompositionBar({ allocation }: { allocation: Allocation }) {
  const [active, setActive] = useState<string | null>(null)
  const method = allocation.model.countMethod

  const segments: Segment[] = allocation.perLayer.map((entry): Segment => {
      const spec = LAYER_SPECS.find((s) => s.id === entry.id)
      return {
        key: entry.id,
        label: spec?.label ?? entry.label,
        color: spec?.color ?? "var(--text-muted)",
        tokens: entry.kept,
      }
    })

  const total = segments.reduce((sum, s) => sum + s.tokens, 0)
  const visible = segments.filter((s) => s.tokens > 0)
  const hovered = visible.find((s) => s.key === active) ?? null

  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm font-medium text-ink">Where the input goes</figcaption>

      <div className="relative">
        <div
          className="flex h-7 w-full gap-[2px] overflow-hidden rounded bg-track"
          role="img"
          aria-label={visible
            .map((s) => `${s.label} ${Math.round((s.tokens / total) * 100)} percent`)
            .join(", ")}
        >
          {total === 0 ? (
            <span className="flex w-full items-center justify-center text-xs text-ink-3">Nothing to show yet</span>
          ) : visible.map((segment) => (
            <button
              key={segment.key}
              type="button"
              className="h-full min-w-0 cursor-default outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ink"
              style={{
                width: `${(segment.tokens / total) * 100}%`,
                background: segment.color,
                opacity: active && active !== segment.key ? 0.45 : 1,
              }}
              aria-label={`${segment.label}: ${formatTokens({ tokens: segment.tokens, method })} tokens`}
              onMouseEnter={() => setActive(segment.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(segment.key)}
              onBlur={() => setActive(null)}
            />
          ))}
        </div>

        {hovered ? (
          <div
            role="status"
            className="pointer-events-none absolute left-0 top-9 z-10 rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm shadow-sm"
          >
            <div className="flex items-center gap-2 text-ink">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: hovered.color }} />
              {hovered.label}
            </div>
            <div className="tabular mt-0.5 text-ink-2">
              {formatTokens({ tokens: hovered.tokens, method })} tokens ·{" "}
              {((hovered.tokens / total) * 100).toFixed(1)}% of the input
            </div>
          </div>
        ) : null}
      </div>

      {/* A legend is always present: identity never rests on colour alone. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 p-0 text-xs text-ink-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex list-none items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: segment.color }} />
            {segment.label}
          </li>
        ))}
      </ul>
    </figure>
  )
}
