import { describe, expect, it } from "vitest"

import { estimateTokens } from "@/lib/tokenizer"

/**
 * Characters per token by content kind.
 *
 * These bands are the estimator's contract. "Four characters per token" only holds for
 * English prose; JSON and code tokenise close to twice as densely, and CJK runs over one
 * token per character. A regression that flattened those differences would still pass a
 * prose-only test, so each kind gets its own band.
 */
const SAMPLES: { name: string; text: string; min: number; max: number }[] = [
  {
    name: "english prose",
    text: "The context window is a budget, and almost nobody treats it like one. Every layer spends from the same allowance.",
    min: 3,
    max: 5,
  },
  {
    name: "json tool schema",
    text: '{"name":"search","description":"Search the knowledge base","input_schema":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}}',
    min: 1.4,
    max: 3,
  },
  {
    name: "source code",
    text: "export function allocate(layers: Layer[], model: Model): Allocation {\n  const total = layers.reduce((sum, l) => sum + l.tokens, 0)\n  return { total, limit: model.contextWindow }\n}",
    min: 1.8,
    max: 4,
  },
  {
    name: "digits",
    text: "Order 4417892 totalled 1289.45 on 2026-10-06 across 37 line items.",
    min: 2,
    max: 4,
  },
  {
    name: "japanese",
    text: "コンテキストウィンドウは予算であり、ほとんどの人はそれを予算として扱いません。",
    min: 0.5,
    max: 1.5,
  },
]

describe("characters per token by content kind", () => {
  it.each(SAMPLES)("$name stays between $min and $max", ({ text, min, max }) => {
    const ratio = text.length / estimateTokens(text)
    expect(ratio).toBeGreaterThanOrEqual(min)
    expect(ratio).toBeLessThanOrEqual(max)
  })

  it("charges JSON more per character than prose", () => {
    const [prose, json] = SAMPLES
    const proseRatio = prose.text.length / estimateTokens(prose.text)
    const jsonRatio = json.text.length / estimateTokens(json.text)
    expect(jsonRatio).toBeLessThan(proseRatio)
  })
})
