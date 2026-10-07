import { describe, expect, it } from "vitest"

import { costOf, formatCost } from "@/lib/cost"
import { findModel, type Model } from "@/lib/models"

const model = findModel("claude-opus-5-5") as Model // $4 in, $20 out, per million

describe("costOf", () => {
  it("prices a million input tokens at the published rate", () => {
    expect(costOf(1_000_000, 0, model).input).toBeCloseTo(4, 10)
  })

  it("prices a million output tokens at the published rate", () => {
    expect(costOf(0, 1_000_000, model).output).toBeCloseTo(20, 10)
  })

  it("keeps the two halves separate and sums them", () => {
    const cost = costOf(500_000, 100_000, model)
    expect(cost.input).toBeCloseTo(2, 10)
    expect(cost.output).toBeCloseTo(2, 10)
    expect(cost.total).toBeCloseTo(4, 10)
  })

  it("charges output more than input for the same count", () => {
    expect(costOf(0, 10_000, model).output).toBeGreaterThan(costOf(10_000, 0, model).input)
  })

  it("costs nothing for nothing", () => {
    expect(costOf(0, 0, model).total).toBe(0)
  })

  it("does not produce NaN for a free model", () => {
    const free = { ...model, inputPerMillion: 0, outputPerMillion: 0 }
    expect(costOf(1000, 1000, free).total).toBe(0)
  })

  it("rejects negative token counts", () => {
    expect(() => costOf(-1, 0, model)).toThrow(RangeError)
    expect(() => costOf(0, -1, model)).toThrow(RangeError)
  })
})

describe("formatCost", () => {
  it("shows zero plainly", () => {
    expect(formatCost(0)).toBe("$0")
  })

  it("uses two places for amounts over a dollar", () => {
    expect(formatCost(12.3456)).toBe("$12.35")
  })

  it("keeps enough places that a realistic request is not rounded to nothing", () => {
    // Two decimal places would render every one of these as "$0.00".
    expect(formatCost(0.00042)).toBe("$0.00042")
    expect(formatCost(0.0123)).toBe("$0.012")
  })

  it("reports an amount below its precision as a bound, never as zero", () => {
    expect(formatCost(0.0000001)).toBe("<$0.00001")
  })

  it("groups thousands", () => {
    expect(formatCost(1234.5)).toBe("$1,234.5")
  })

  it("rejects a non-finite amount", () => {
    expect(() => formatCost(Number.NaN)).toThrow(RangeError)
    expect(() => formatCost(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})
