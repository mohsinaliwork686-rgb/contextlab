import { describe, expect, it } from "vitest"

import { LAYER_ORDER, allocate } from "@/lib/budget"
import { LAYER_SPECS, SAMPLE, overflowingSample } from "@/lib/layers"
import { findModel, type Model } from "@/lib/models"

const haiku = findModel("claude-haiku-4-5") as Model
const opus = findModel("claude-opus-5-5") as Model

function layersFrom(texts: Record<string, string>) {
  return LAYER_SPECS.map((spec) => ({ id: spec.id, label: spec.label, text: texts[spec.id] }))
}

describe("layer specs", () => {
  it("cover every layer, in stack order", () => {
    expect(LAYER_SPECS.map((spec) => spec.id)).toEqual(LAYER_ORDER)
  })

  it("map each layer to its own palette slot", () => {
    const colors = LAYER_SPECS.map((spec) => spec.color)
    expect(new Set(colors).size).toBe(colors.length)
    colors.forEach((color, index) => expect(color).toBe(`var(--series-${index + 1})`))
  })
})

describe("the default sample", () => {
  it("fills every layer, so the page has something to show on first load", () => {
    for (const id of LAYER_ORDER) expect(SAMPLE[id].length).toBeGreaterThan(0)
  })

  it("fits comfortably in the default model", () => {
    const result = allocate(layersFrom(SAMPLE), opus, 4000)
    expect(result.overflowBy).toBe(0)
  })
})

describe("the overflowing sample", () => {
  // These guard the "Load one that overflows" button. It used a fixed turn count, and
  // reflowing the sample text made each turn cheaper until the "overflowing" request
  // fitted with room to spare — the button kept its label and stopped doing its job.
  const result = allocate(layersFrom(overflowingSample()), haiku, 4000)

  it("really does overflow the model it switches to", () => {
    expect(result.overflowBy).toBeGreaterThan(0)
  })

  it("is rescued by trimming, so it demonstrates the cut rather than a dead end", () => {
    expect(result.unresolvedOverflow).toBe(0)
  })

  it("trims the history, which is the layer it was built to show", () => {
    const history = result.perLayer.find((entry) => entry.id === "history")!
    expect(history.dropped).toBeGreaterThan(0)
  })

  it("overflows by a clear margin, not by a few tokens a text edit could erase", () => {
    expect(result.overflowBy).toBeGreaterThan(haiku.contextWindow * 0.05)
  })
})
