import { costOf, type Cost } from "./cost"
import type { Model } from "./models"
import { countTokens, estimateTokens } from "./tokenizer"

/**
 * Working out what fits.
 *
 * One function, `allocate`, turns the layers plus a model into everything the page
 * shows. If a number appears on screen, it comes from here.
 */

export type LayerId = "system" | "tools" | "examples" | "retrieved" | "history"

export const LAYER_ORDER: LayerId[] = ["system", "tools", "examples", "retrieved", "history"]

export interface Layer {
  id: LayerId
  label: string
  text: string
}

/**
 * Which end of a layer to cut from.
 *
 * It matters. Conversation history is trimmed from the start, because the oldest turns
 * are the ones you can afford to lose. Retrieved chunks are trimmed from the end,
 * because they arrive ranked and the last ones are the weakest. Cutting history from
 * the end would throw away the most recent message, which is usually the question.
 */
export interface TrimRule {
  id: LayerId
  dropFrom: "start" | "end"
}

/**
 * The default trim order, lowest value first.
 *
 * A layer that does not appear here is never trimmed: dropping the system prompt or the
 * tool definitions changes what the model *is*, so the budget is not allowed to spend
 * them. That absence is the only definition of "not trimmable" — there is no separate
 * flag to disagree with it.
 */
export const DEFAULT_TRIM_ORDER: TrimRule[] = [
  { id: "history", dropFrom: "start" },
  { id: "retrieved", dropFrom: "end" },
  { id: "examples", dropFrom: "end" },
]

export interface LayerAllocation {
  id: LayerId
  label: string
  /** What the layer costs in full. */
  tokens: number
  /** What survives trimming. */
  kept: number
  /** What trimming removed. */
  dropped: number
  /** The surviving slice: `text.slice(keptFrom, keptTo)`. Lets the page grey out the rest. */
  keptFrom: number
  keptTo: number
}

export interface Allocation {
  perLayer: LayerAllocation[]
  model: Model
  outputReserve: number
  /** Room for input: the window less the output reserve, never below zero. */
  inputBudget: number
  /** Input tokens before trimming. */
  total: number
  /** Input tokens after trimming. */
  keptTotal: number
  /** How far the untrimmed request overruns the budget. Zero when it already fits. */
  overflowBy: number
  /**
   * What is still over after trimming everything the policy allows.
   *
   * Normally zero. Non-zero means the layers that cannot be trimmed do not fit on their
   * own, and no amount of dropping history will help — a different message entirely.
   */
  unresolvedOverflow: number
  /** Where the running total crosses the budget, scanning in display order. */
  firstLayerOverLimit: LayerId | null
  /** Priced on what would actually be sent, so a trimmed request costs trimmed money. */
  cost: Cost
}

/** Do not cut between the two halves of a surrogate pair. */
function safeBoundary(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index
  const code = text.charCodeAt(index - 1)
  const isHighSurrogate = code >= 0xd800 && code <= 0xdbff
  return isHighSurrogate ? index - 1 : index
}

/**
 * The longest prefix of `text` that fits in `targetTokens`.
 *
 * Found by bisection rather than by scaling characters against the average, because the
 * average is wrong exactly where it matters: a layer of JSON tokenises at roughly half
 * the characters per token of the prose beside it.
 */
function longestPrefixWithin(text: string, targetTokens: number): number {
  if (targetTokens <= 0) return 0
  if (estimateTokens(text) <= targetTokens) return text.length

  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (estimateTokens(text.slice(0, mid)) <= targetTokens) low = mid
    else high = mid - 1
  }
  return safeBoundary(text, low)
}

/** The shortest suffix start index such that the suffix fits in `targetTokens`. */
function shortestSuffixWithin(text: string, targetTokens: number): number {
  if (targetTokens <= 0) return text.length
  if (estimateTokens(text) <= targetTokens) return 0

  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (estimateTokens(text.slice(mid)) <= targetTokens) high = mid
    else low = mid + 1
  }
  return safeBoundary(text, low)
}

export function allocate(
  layers: Layer[],
  model: Model,
  outputReserve: number,
  policy: TrimRule[] = DEFAULT_TRIM_ORDER,
): Allocation {
  if (!Number.isFinite(outputReserve) || outputReserve < 0) {
    throw new RangeError("outputReserve must be zero or more")
  }

  const perLayer: LayerAllocation[] = layers.map((layer) => {
    const tokens = countTokens(layer.text, model).tokens
    return {
      id: layer.id,
      label: layer.label,
      tokens,
      kept: tokens,
      dropped: 0,
      keptFrom: 0,
      keptTo: layer.text.length,
    }
  })

  const total = perLayer.reduce((sum, entry) => sum + entry.tokens, 0)
  const inputBudget = Math.max(0, model.contextWindow - outputReserve)
  const overflowBy = Math.max(0, total - inputBudget)

  let stillToDrop = overflowBy
  for (const rule of policy) {
    if (stillToDrop <= 0) break

    const index = layers.findIndex((layer) => layer.id === rule.id)
    if (index === -1) continue

    const entry = perLayer[index]
    if (entry.tokens === 0) continue

    const text = layers[index].text
    const target = Math.max(0, entry.tokens - stillToDrop)

    if (rule.dropFrom === "end") {
      entry.keptFrom = 0
      entry.keptTo = longestPrefixWithin(text, target)
    } else {
      entry.keptFrom = shortestSuffixWithin(text, target)
      entry.keptTo = text.length
    }

    entry.kept = estimateTokens(text.slice(entry.keptFrom, entry.keptTo))
    entry.dropped = entry.tokens - entry.kept
    stillToDrop -= entry.dropped
  }

  const keptTotal = perLayer.reduce((sum, entry) => sum + entry.kept, 0)

  let running = 0
  let firstLayerOverLimit: LayerId | null = null
  for (const entry of perLayer) {
    running += entry.tokens
    if (running > inputBudget) {
      firstLayerOverLimit = entry.id
      break
    }
  }

  return {
    perLayer,
    model,
    outputReserve,
    inputBudget,
    total,
    keptTotal,
    overflowBy,
    unresolvedOverflow: Math.max(0, keptTotal - inputBudget),
    firstLayerOverLimit,
    cost: costOf(keptTotal, outputReserve, model),
  }
}

/** Convenience for the bar: what share of the budget a layer takes, 0 to 1. */
export function shareOfBudget(entry: LayerAllocation, allocation: Allocation): number {
  if (allocation.inputBudget <= 0) return 0
  return entry.kept / allocation.inputBudget
}
