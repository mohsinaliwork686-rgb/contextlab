import type { Allocation } from "@/lib/budget"
import { formatCost } from "@/lib/cost"
import { formatTokens } from "@/lib/tokenizer"

/**
 * The headline numbers.
 *
 * Status is the one tile with a colour, and it never relies on the colour: every state
 * has its own icon and its own words. Text stays in ink; the icon carries the hue.
 */

type Status = { label: string; detail: string; color: string; icon: "check" | "minus" | "stop" }

function statusOf(allocation: Allocation): Status {
  const method = allocation.model.countMethod
  if (allocation.unresolvedOverflow > 0) {
    return {
      label: "Does not fit",
      detail: `${formatTokens({ tokens: allocation.unresolvedOverflow, method })} over even after trimming`,
      color: "var(--status-critical)",
      icon: "stop",
    }
  }
  if (allocation.overflowBy > 0) {
    return {
      label: "Trimmed to fit",
      detail: `${formatTokens({ tokens: allocation.overflowBy, method })} dropped`,
      color: "var(--status-serious)",
      icon: "minus",
    }
  }
  return {
    label: "Fits",
    detail: `${formatTokens({ tokens: allocation.inputBudget - allocation.keptTotal, method })} to spare`,
    color: "var(--status-good)",
    icon: "check",
  }
}

function StatusIcon({ kind, color }: { kind: Status["icon"]; color: string }) {
  // A cross would read as failure, but trimming is the tool doing its job, so "trimmed"
  // gets a minus: reduced, not broken.
  const paths = {
    check: "M4 8.5l2.5 2.5L12 5.5",
    minus: "M4.5 8h7",
    stop: "M8 4.5v4M8 11v.5",
  }
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill={color} />
      <path d={paths[kind]} stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Tile({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-surface px-4 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-ink-2">{detail}</div> : null}
    </div>
  )
}

export function StatTiles({ allocation }: { allocation: Allocation }) {
  const method = allocation.model.countMethod
  const status = statusOf(allocation)
  const used = allocation.keptTotal + allocation.outputReserve
  const share = used / allocation.model.contextWindow

  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        label="Input sent"
        value={formatTokens({ tokens: allocation.keptTotal, method })}
        detail={method === "estimated" ? "Estimated count" : "Exact count"}
      />
      <Tile
        label="Window used"
        value={`${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`}
        detail={`of ${allocation.model.contextWindow.toLocaleString("en-US")} tokens`}
      />
      {/* A ceiling, not a typical cost: it assumes the answer uses all of the reserve. */}
      <Tile
        label="Cost at most"
        value={formatCost(allocation.cost.total)}
        detail={`${formatCost(allocation.cost.input)} input · ${formatCost(allocation.cost.output)} if the full reserve is used`}
      />
      <div className="rounded-lg border border-[var(--border)] bg-surface px-4 py-3">
        <div className="text-xs text-ink-3">Status</div>
        <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink">
          <StatusIcon kind={status.icon} color={status.color} />
          {status.label}
        </div>
        <div className="mt-0.5 text-xs text-ink-2">{status.detail}</div>
      </div>
    </div>
  )
}
