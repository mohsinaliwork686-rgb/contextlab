import { describe, expect, it } from "vitest"

import { countTokens, estimateTokens, formatTokens } from "@/lib/tokenizer"
import { defaultModel } from "@/lib/models"

const PROSE = `The context window is a budget, and almost nobody treats it like one. People
think of the prompt as one thing, but it is really a stack, and every layer spends from the
same allowance: the system prompt, the tool definitions, the few-shot examples, whatever
retrieval returned, the conversation so far, and the space the answer itself needs.`

describe("estimateTokens", () => {
  it("counts nothing for an empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })

  it("counts nothing for whitespace alone", () => {
    expect(estimateTokens("   \t  ")).toBe(0)
  })

  it("treats a short word as one token", () => {
    expect(estimateTokens("cat")).toBe(1)
  })

  it("splits a long word into several", () => {
    expect(estimateTokens("antidisestablishmentarianism")).toBeGreaterThan(4)
  })

  it("grows with length", () => {
    expect(estimateTokens(PROSE.repeat(2))).toBeGreaterThan(estimateTokens(PROSE))
  })

  it("lands in the usual band for English prose", () => {
    // The rule of thumb is one token per ~4 characters. Anything outside 3 to 5 means
    // the estimator has drifted somewhere it should not have.
    const charsPerToken = PROSE.length / estimateTokens(PROSE)
    expect(charsPerToken).toBeGreaterThan(3)
    expect(charsPerToken).toBeLessThan(5)
  })

  it("is deterministic", () => {
    expect(estimateTokens(PROSE)).toBe(estimateTokens(PROSE))
  })

  it("counts newlines, which are tokens too", () => {
    expect(estimateTokens("a\nb\nc")).toBeGreaterThan(estimateTokens("a b c"))
  })

  it("charges digits more per character than letters", () => {
    expect(estimateTokens("1234567890")).toBeGreaterThan(estimateTokens("abcdefghij"))
  })

  it("charges CJK far more per character than Latin", () => {
    const japanese = estimateTokens("日本語のテキストです")
    const latin = estimateTokens("abcdefghij")
    expect(japanese).toBeGreaterThan(latin * 2)
  })

  it("charges emoji more than a letter", () => {
    expect(estimateTokens("🎉")).toBeGreaterThan(estimateTokens("a"))
  })

  it("does not split an emoji into broken halves", () => {
    // "🎉" is two UTF-16 units but one character. Counting units would double the cost.
    expect(estimateTokens("🎉")).toBe(2)
  })

  it("handles accented Latin like ordinary Latin", () => {
    expect(estimateTokens("café")).toBe(estimateTokens("cafe"))
  })

  it("scales with the calibration factor", () => {
    const base = estimateTokens(PROSE)
    expect(estimateTokens(PROSE, 2)).toBe(Math.round(base * 2))
  })

  it("rejects a calibration of zero or less", () => {
    expect(() => estimateTokens("x", 0)).toThrow(RangeError)
    expect(() => estimateTokens("x", -1)).toThrow(RangeError)
  })

  it("stays fast on a large document", () => {
    const big = PROSE.repeat(400) // roughly 120k characters
    const started = performance.now()
    const tokens = estimateTokens(big)
    expect(tokens).toBeGreaterThan(10000)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe("countTokens", () => {
  it("reports the model's count method", () => {
    expect(countTokens(PROSE, defaultModel()).method).toBe("estimated")
  })

  it("agrees with the estimator", () => {
    expect(countTokens(PROSE, defaultModel()).tokens).toBe(estimateTokens(PROSE))
  })
})

describe("formatTokens", () => {
  it("marks an estimate with a tilde, so nobody reads it as exact", () => {
    expect(formatTokens({ tokens: 1310, method: "estimated" })).toBe("~1,310")
  })

  it("leaves an exact count unmarked", () => {
    expect(formatTokens({ tokens: 1284, method: "exact" })).toBe("1,284")
  })

  it("groups thousands", () => {
    expect(formatTokens({ tokens: 1234567, method: "exact" })).toBe("1,234,567")
  })

  it("handles zero", () => {
    expect(formatTokens({ tokens: 0, method: "exact" })).toBe("0")
  })
})
