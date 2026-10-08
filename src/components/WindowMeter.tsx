import type { Allocation } from "@/lib/budget"
import { formatTokens } from "@/lib/tokenizer"

/**
 * How full the context window is.
 *
 * A meter, not a chart: one fill whose colour carries severity, on a track. Scaled to
 * the window. Overflow is shown as a full bar plus words, never by drawing past the edge,
 * because a bar wider than its container reads as a layout bug rather than as "over".
 */
export function WindowMeter({ allocation }: { allocation: Allocation }) {
  const contextWindow = allocation.model.contextWindow
  const used = allocation.keptTotal + allocation.outputReserve
  const share = Math.min(1, used / contextWindow)
  const method = allocation.model.countMethod

  const severity =
    allocation.unresolvedOverflow > 0
      ? "var(--status-critical)"
      : share >= 0.9
        ? "var(--status-serious)"
        : "var(--series-1)"

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink">Context window</span>
        <span className="tabular text-ink-2">
          {formatTokens({ tokens: used, method })} of {contextWindow.toLocaleString("en-US")}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded bg-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={contextWindow}
        aria-valuenow={Math.min(used, contextWindow)}
        aria-label="Share of the context window used"
      >
        <div
          className="h-full rounded transition-[width]"
          style={{ width: `${Math.max(share * 100, used > 0 ? 0.5 : 0)}%`, background: severity }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-3">
        {(share * 100).toFixed(share < 0.01 ? 2 : 1)}% used, including the output reserve
      </p>
    </div>
  )
}
