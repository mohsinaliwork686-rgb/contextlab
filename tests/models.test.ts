import { describe, expect, it } from "vitest"

import {
  LAST_UPDATED,
  MODELS,
  ModelDataError,
  defaultModel,
  findModel,
  outputCeiling,
  parseModel,
  parseModelTable,
} from "@/lib/models"

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-model",
    label: "Test Model",
    family: "test",
    contextWindow: 200000,
    maxOutput: 8192,
    inputPerMillion: 1,
    outputPerMillion: 5,
    countMethod: "estimated",
    source: "https://example.com/pricing",
    ...overrides,
  }
}

function table(models: unknown[]) {
  return { lastUpdated: "2026-09-25", note: "n", models }
}

describe("the shipped table", () => {
  it("validates on import", () => {
    expect(MODELS.length).toBeGreaterThan(0)
  })

  it("has a sensible last-updated date", () => {
    expect(LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("has unique ids", () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length)
  })

  it("gives every model a source link, so the numbers can be checked", () => {
    for (const model of MODELS) {
      expect(model.source).toMatch(/^https:\/\//)
    }
  })

  it("prices output at least as high as input", () => {
    for (const model of MODELS) {
      expect(model.outputPerMillion).toBeGreaterThanOrEqual(model.inputPerMillion)
    }
  })

  it("resolves the default model", () => {
    expect(defaultModel()).toBeDefined()
    expect(MODELS).toContain(defaultModel())
  })

  it("finds a model by id and returns undefined otherwise", () => {
    expect(findModel(MODELS[0].id)).toEqual(MODELS[0])
    expect(findModel("no-such-model")).toBeUndefined()
  })
})

describe("outputCeiling", () => {
  it("uses the published output cap when there is one", () => {
    expect(outputCeiling(parseModel(entry({ maxOutput: 8192 }), 0))).toBe(8192)
  })

  it("falls back to the context window when no cap is published", () => {
    const model = parseModel(entry({ maxOutput: undefined }), 0)
    expect(outputCeiling(model)).toBe(200000)
  })
})

describe("validation rejects bad data loudly", () => {
  it("names the model in the message", () => {
    expect(() => parseModel(entry({ contextWindow: 0 }), 0)).toThrow(/model test-model/)
  })

  it("names the position when the id itself is missing", () => {
    expect(() => parseModel(entry({ id: "" }), 3)).toThrow(/models\[3\]/)
  })

  it.each([
    ["contextWindow", 0],
    ["contextWindow", -1],
    ["contextWindow", "big"],
    ["maxOutput", 0],
    ["inputPerMillion", -1],
    ["outputPerMillion", "free"],
    ["label", ""],
    ["family", ""],
    ["source", ""],
  ])("rejects %s = %o", (field, value) => {
    expect(() => parseModel(entry({ [field]: value }), 0)).toThrow(ModelDataError)
  })

  it("accepts a price of zero, for a model that costs nothing to run", () => {
    expect(parseModel(entry({ inputPerMillion: 0, outputPerMillion: 0 }), 0)).toBeDefined()
  })

  it("rejects an unknown countMethod", () => {
    expect(() => parseModel(entry({ countMethod: "guessed" }), 0)).toThrow(/countMethod/)
  })

  it("rejects an exact model with no encoding to count with", () => {
    expect(() => parseModel(entry({ countMethod: "exact" }), 0)).toThrow(/requires an encoding/)
  })

  it("accepts an exact model that has an encoding", () => {
    const model = parseModel(entry({ countMethod: "exact", encoding: "o200k_base" }), 0)
    expect(model.encoding).toBe("o200k_base")
  })

  it("rejects an output cap larger than the whole window", () => {
    expect(() => parseModel(entry({ contextWindow: 1000, maxOutput: 2000 }), 0)).toThrow(
      /cannot exceed contextWindow/,
    )
  })

  it("rejects a non-object entry", () => {
    expect(() => parseModel("not a model", 2)).toThrow(/models\[2\] must be an object/)
  })
})

describe("table validation", () => {
  it("rejects an empty model list", () => {
    expect(() => parseModelTable(table([]))).toThrow(/non-empty array/)
  })

  it("rejects duplicate ids", () => {
    expect(() => parseModelTable(table([entry(), entry()]))).toThrow(/duplicate model id/)
  })

  it("rejects a malformed date", () => {
    expect(() => parseModelTable({ ...table([entry()]), lastUpdated: "Sept 2026" })).toThrow(
      /ISO date/,
    )
  })

  it("requires the note, because the footer shows it", () => {
    expect(() => parseModelTable({ lastUpdated: "2026-09-25", models: [entry()] })).toThrow(/note/)
  })

  it("rejects a non-object file", () => {
    expect(() => parseModelTable(null)).toThrow(/must contain an object/)
  })
})
