import { describe, expect, it } from "vitest"

import {
  DEFAULT_TRIM_ORDER,
  allocate,
  shareOfBudget,
  type Layer,
  type LayerId,
} from "@/lib/budget"
import { findModel, type Model } from "@/lib/models"
import { estimateTokens } from "@/lib/tokenizer"

const model = findModel("claude-opus-5-5") as Model

/** A model with a tiny window, so overflow is reachable without megabytes of text. */
function smallModel(contextWindow: number): Model {
  return { ...model, contextWindow, maxOutput: Math.min(contextWindow, 1024) }
}

function layer(id: LayerId, text: string): Layer {
  return { id, label: id, text }
}

/**
 * Text with a predictable token cost: `count` distinct four-letter words, one token each.
 *
 * Letters only, deliberately. A word like "w001" costs two tokens, not one, because the
 * estimator splits the letter run from the digit run — which is right, and which quietly
 * doubled every number here when this helper mixed the two.
 */
function words(count: number): string {
  return Array.from({ length: count }, (_, index) => {
    let remaining = index
    let word = ""
    for (let position = 0; position < 4; position += 1) {
      word = String.fromCharCode(97 + (remaining % 26)) + word
      remaining = Math.floor(remaining / 26)
    }
    return word
  }).join(" ")
}

describe("when everything fits", () => {
  const layers = [layer("system", "You are a helpful assistant."), layer("history", words(20))]

  it("drops nothing", () => {
    const result = allocate(layers, model, 1000)
    expect(result.overflowBy).toBe(0)
    expect(result.unresolvedOverflow).toBe(0)
    for (const entry of result.perLayer) {
      expect(entry.dropped).toBe(0)
      expect(entry.kept).toBe(entry.tokens)
    }
  })

  it("keeps every layer whole", () => {
    const result = allocate(layers, model, 1000)
    result.perLayer.forEach((entry, index) => {
      expect(entry.keptFrom).toBe(0)
      expect(entry.keptTo).toBe(layers[index].text.length)
    })
  })

  it("reports no layer as the one that crossed the line", () => {
    expect(allocate(layers, model, 1000).firstLayerOverLimit).toBeNull()
  })

  it("totals the layers", () => {
    const result = allocate(layers, model, 1000)
    const expected = layers.reduce((sum, l) => sum + estimateTokens(l.text), 0)
    expect(result.total).toBe(expected)
    expect(result.keptTotal).toBe(expected)
  })
})

describe("the output reserve", () => {
  it("comes out of the window before anything else", () => {
    const result = allocate([], smallModel(1000), 400)
    expect(result.inputBudget).toBe(600)
  })

  it("can swallow the whole window, leaving no room for input", () => {
    const result = allocate([layer("system", words(50))], smallModel(1000), 1000)
    expect(result.inputBudget).toBe(0)
    expect(result.overflowBy).toBeGreaterThan(0)
  })

  it("never drives the input budget negative", () => {
    expect(allocate([], smallModel(1000), 5000).inputBudget).toBe(0)
  })

  it("is rejected when negative", () => {
    expect(() => allocate([], model, -1)).toThrow(RangeError)
  })

  it("is rejected when not a number", () => {
    expect(() => allocate([], model, Number.NaN)).toThrow(RangeError)
  })
})

describe("when it does not fit", () => {
  const big = words(400)
  const layers = [layer("system", "Be concise."), layer("history", big)]

  it("reports how far over the untrimmed request is", () => {
    const tiny = smallModel(200)
    const result = allocate(layers, tiny, 50)
    expect(result.overflowBy).toBe(result.total - result.inputBudget)
    expect(result.overflowBy).toBeGreaterThan(0)
  })

  it("names the layer where the running total crosses", () => {
    const result = allocate(layers, smallModel(200), 50)
    expect(result.firstLayerOverLimit).toBe("history")
  })

  it("trims until it fits, and no further", () => {
    const result = allocate(layers, smallModel(200), 50)
    expect(result.keptTotal).toBeLessThanOrEqual(result.inputBudget)
    expect(result.unresolvedOverflow).toBe(0)
  })

  it("leaves a character range the page can grey out", () => {
    const result = allocate(layers, smallModel(200), 50)
    const history = result.perLayer.find((e) => e.id === "history")!
    expect(history.keptFrom).toBeGreaterThan(0)
    expect(history.keptTo).toBe(big.length)
    expect(history.dropped).toBeGreaterThan(0)
  })
})

describe("trim order", () => {
  it("spends history before retrieved chunks", () => {
    const layers = [layer("retrieved", words(100)), layer("history", words(100))]
    const result = allocate(layers, smallModel(200), 20)
    const history = result.perLayer.find((e) => e.id === "history")!
    const retrieved = result.perLayer.find((e) => e.id === "retrieved")!
    expect(history.dropped).toBeGreaterThan(0)
    expect(retrieved.dropped).toBe(0)
  })

  it("moves on to retrieved once history is gone", () => {
    const layers = [layer("retrieved", words(300)), layer("history", words(20))]
    const result = allocate(layers, smallModel(150), 20)
    expect(result.perLayer.find((e) => e.id === "history")!.kept).toBe(0)
    expect(result.perLayer.find((e) => e.id === "retrieved")!.dropped).toBeGreaterThan(0)
  })

  it("never touches the system prompt or the tool definitions", () => {
    const layers = [
      layer("system", words(200)),
      layer("tools", words(200)),
      layer("history", words(200)),
    ]
    const result = allocate(layers, smallModel(300), 20)
    expect(result.perLayer.find((e) => e.id === "system")!.dropped).toBe(0)
    expect(result.perLayer.find((e) => e.id === "tools")!.dropped).toBe(0)
  })

  it("says so when the untrimmable layers alone do not fit", () => {
    // Nothing can rescue this: the fixed layers overrun the window by themselves.
    const layers = [layer("system", words(500)), layer("history", words(10))]
    const result = allocate(layers, smallModel(200), 20)
    expect(result.unresolvedOverflow).toBeGreaterThan(0)
    expect(result.perLayer.find((e) => e.id === "history")!.kept).toBe(0)
  })

  it("honours a custom policy", () => {
    const layers = [layer("retrieved", words(100)), layer("history", words(100))]
    const reversed = [
      { id: "retrieved" as const, dropFrom: "end" as const },
      { id: "history" as const, dropFrom: "start" as const },
    ]
    const result = allocate(layers, smallModel(200), 20, reversed)
    expect(result.perLayer.find((e) => e.id === "retrieved")!.dropped).toBeGreaterThan(0)
    expect(result.perLayer.find((e) => e.id === "history")!.dropped).toBe(0)
  })

  it("ignores policy entries for layers that are not present", () => {
    const result = allocate([layer("history", words(300))], smallModel(200), 20, DEFAULT_TRIM_ORDER)
    expect(result.keptTotal).toBeLessThanOrEqual(result.inputBudget)
  })
})

describe("which end gets cut", () => {
  it("drops the oldest history, keeping the newest turn", () => {
    const text = "OLDEST turn here. " + words(200) + " NEWEST turn here."
    const result = allocate([layer("history", text)], smallModel(120), 20)
    const entry = result.perLayer[0]
    const kept = text.slice(entry.keptFrom, entry.keptTo)
    expect(kept).toContain("NEWEST")
    expect(kept).not.toContain("OLDEST")
  })

  it("drops the lowest-ranked chunks, keeping the best", () => {
    const text = "BEST chunk here. " + words(200) + " WORST chunk here."
    const result = allocate([layer("retrieved", text)], smallModel(120), 20)
    const entry = result.perLayer[0]
    const kept = text.slice(entry.keptFrom, entry.keptTo)
    expect(kept).toContain("BEST")
    expect(kept).not.toContain("WORST")
  })
})

describe("the trim boundary", () => {
  it("is as generous as it can be without going over", () => {
    const text = words(300)
    const result = allocate([layer("history", text)], smallModel(200), 20)
    const entry = result.perLayer[0]
    const kept = text.slice(entry.keptFrom, entry.keptTo)
    expect(estimateTokens(kept)).toBeLessThanOrEqual(entry.kept)
    // One character more would have cost at least as much, never less.
    const oneMore = text.slice(Math.max(0, entry.keptFrom - 1), entry.keptTo)
    expect(estimateTokens(oneMore)).toBeGreaterThanOrEqual(estimateTokens(kept))
  })

  it("does not split a surrogate pair in half", () => {
    const text = "🎉".repeat(400)
    const result = allocate([layer("history", text)], smallModel(200), 20)
    const entry = result.perLayer[0]
    const kept = text.slice(entry.keptFrom, entry.keptTo)
    // A broken pair shows up as a lone surrogate, which renders as a replacement char.
    expect(kept).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    expect(kept).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it("handles a layer that is trimmed away entirely", () => {
    // The reserve fills the window, so there is no room for input at all.
    const result = allocate([layer("history", words(500))], smallModel(60), 60)
    const entry = result.perLayer[0]
    expect(entry.kept).toBe(0)
    expect(entry.keptFrom).toBe(entry.keptTo)
  })
})

describe("edge cases", () => {
  it("handles no layers at all", () => {
    const result = allocate([], model, 1000)
    expect(result.total).toBe(0)
    expect(result.perLayer).toEqual([])
    expect(result.firstLayerOverLimit).toBeNull()
  })

  it("handles empty text in every layer", () => {
    const result = allocate([layer("system", ""), layer("history", "")], model, 100)
    expect(result.total).toBe(0)
    expect(result.cost.input).toBe(0)
  })

  it("fits exactly without reporting overflow", () => {
    const text = words(50)
    const exact = smallModel(estimateTokens(text) + 100)
    const result = allocate([layer("system", text)], exact, 100)
    expect(result.total).toBe(result.inputBudget)
    expect(result.overflowBy).toBe(0)
  })

  it("reports one token over as one token over", () => {
    const text = words(50)
    const tight = smallModel(estimateTokens(text) + 100 - 1)
    const result = allocate([layer("system", text)], tight, 100)
    expect(result.overflowBy).toBe(1)
  })
})

describe("cost", () => {
  it("prices what would be sent, not what was typed", () => {
    const layers = [layer("history", words(400))]
    const result = allocate(layers, smallModel(200), 20)
    const untrimmed = allocate(layers, model, 20)
    expect(result.keptTotal).toBeLessThan(untrimmed.keptTotal)
    expect(result.cost.input).toBeLessThan(untrimmed.cost.input)
  })

  it("includes the reserved output in the total", () => {
    const result = allocate([layer("system", words(10))], model, 4000)
    expect(result.cost.output).toBeGreaterThan(0)
    expect(result.cost.total).toBe(result.cost.input + result.cost.output)
  })
})

describe("shareOfBudget", () => {
  it("reports the fraction of the budget a layer takes", () => {
    const result = allocate([layer("system", words(50))], smallModel(1000), 0)
    const share = shareOfBudget(result.perLayer[0], result)
    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThanOrEqual(1)
  })

  it("does not divide by zero when the reserve fills the window", () => {
    const result = allocate([layer("system", words(50))], smallModel(500), 500)
    expect(shareOfBudget(result.perLayer[0], result)).toBe(0)
  })
})
