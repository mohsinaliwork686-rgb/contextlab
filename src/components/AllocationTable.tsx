import type { Allocation } from "@/lib/budget"
import { LAYER_SPECS, OUTPUT_COLOR } from "@/lib/layers"
import { formatTokens } from "@/lib/tokenizer"

/**
 * The same numbers as the bar, as a table.
 *
 * Not an optional extra. Three of the light-mode series colours are under 3:1 against
 * the surface, and the palette is only acceptable because this table and the legend
 * both exist. It is also the view a screen reader gets.
 */
export function AllocationTable({ allocation }: { allocation: Allocation }) {
  const method = allocation.model.countMethod
  // Share of the input, matching the composition bar. The table is the accessible
  // version of that bar, so the two must report the same numbers.
  const input = allocation.keptTotal
  const percent = (tokens: number) => (input > 0 ? `${((tokens / input) * 100).toFixed(1)}%` : "—")

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Tokens per layer, before and after trimming</caption>
      <thead>
        <tr className="border-b border-hairline text-left text-xs text-ink-3">
          <th scope="col" className="py-2 font-normal">Layer</th>
          <th scope="col" className="py-2 text-right font-normal">Tokens</th>
          <th scope="col" className="py-2 text-right font-normal">Dropped</th>
          <th scope="col" className="py-2 text-right font-normal">Of input</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {allocation.perLayer.map((entry) => {
          const spec = LAYER_SPECS.find((s) => s.id === entry.id)
          return (
            <tr key={entry.id} className="border-b border-hairline">
              <th scope="row" className="py-2 text-left font-normal text-ink">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: spec?.color }} />
                  {spec?.label ?? entry.label}
                </span>
              </th>
              <td className="py-2 text-right text-ink">{formatTokens({ tokens: entry.kept, method })}</td>
              <td className="py-2 text-right text-ink-2">
                {entry.dropped > 0 ? formatTokens({ tokens: entry.dropped, method }) : "—"}
              </td>
              <td className="py-2 text-right text-ink-2">{percent(entry.kept)}</td>
            </tr>
          )
        })}
        <tr className="border-b border-hairline">
          <th scope="row" className="py-2 text-left font-normal text-ink">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: OUTPUT_COLOR }} />
              Output reserve
            </span>
          </th>
          <td className="py-2 text-right text-ink">{allocation.outputReserve.toLocaleString("en-US")}</td>
          <td className="py-2 text-right text-ink-2">—</td>
          <td className="py-2 text-right text-ink-2">—</td>
        </tr>
      </tbody>
    </table>
  )
}
