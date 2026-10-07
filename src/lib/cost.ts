import type { Model } from "./models"

/**
 * What a request costs.
 *
 * Input and output are priced separately and usually several times apart, so a long
 * prompt with a short answer and a short prompt with a long answer cost very different
 * amounts. Keeping the two halves separate in the result is the point — a single total
 * hides which half is actually expensive.
 */

export interface Cost {
  input: number
  output: number
  total: number
}

const PER_MILLION = 1_000_000

export function costOf(inputTokens: number, outputTokens: number, model: Model): Cost {
  if (inputTokens < 0 || outputTokens < 0) {
    throw new RangeError("token counts cannot be negative")
  }
  const input = (inputTokens / PER_MILLION) * model.inputPerMillion
  const output = (outputTokens / PER_MILLION) * model.outputPerMillion
  return { input, output, total: input + output }
}

/**
 * Render a dollar amount at a precision that keeps it meaningful.
 *
 * A single request often costs a fraction of a cent. Rounding that to two decimal
 * places shows "$0.00" for every realistic prompt, which tells the reader nothing, so
 * small amounts get more places rather than fewer.
 */
export function formatCost(usd: number, locale = "en-US"): string {
  if (!Number.isFinite(usd)) throw new RangeError("cost must be a finite number")
  if (usd === 0) return "$0"

  const places = usd >= 1 ? 2 : usd >= 0.01 ? 3 : 5
  const rendered = usd.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  })
  // Anything that rounds away entirely is reported as a bound, not as zero.
  return rendered === "0" ? "<$0.00001" : `$${rendered}`
}
