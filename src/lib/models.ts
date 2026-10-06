import raw from "./models.data.json"

/**
 * The model table.
 *
 * Validation runs when this module is imported, which means a malformed edit to
 * models.data.json fails `next build` rather than producing a page with NaN in the
 * cost column. The error names the offending entry.
 */

export type CountMethod = "exact" | "estimated"

export interface Model {
  id: string
  label: string
  family: string
  /** Total tokens the model accepts in one request, input and output together. */
  contextWindow: number
  /** Cap on the generated response. Absent when the vendor does not publish one. */
  maxOutput?: number
  inputPerMillion: number
  outputPerMillion: number
  /** Whether token counts for this model are exact or approximated. */
  countMethod: CountMethod
  /** Encoding name, required when countMethod is "exact". */
  encoding?: string
  /** Where the numbers came from, so a reader can check them. */
  source: string
}

export interface ModelTable {
  lastUpdated: string
  note: string
  models: Model[]
}

export class ModelDataError extends Error {
  constructor(message: string) {
    super(`models.data.json: ${message}`)
    this.name = "ModelDataError"
  }
}

function requireString(value: unknown, field: string, where: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ModelDataError(`${where}: ${field} must be a non-empty string`)
  }
  return value
}

function requirePositive(value: unknown, field: string, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ModelDataError(`${where}: ${field} must be a positive number`)
  }
  return value
}

function requireNonNegative(value: unknown, field: string, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ModelDataError(`${where}: ${field} must be a number of zero or more`)
  }
  return value
}

export function parseModel(value: unknown, position: number): Model {
  if (typeof value !== "object" || value === null) {
    throw new ModelDataError(`models[${position}] must be an object`)
  }
  const entry = value as Record<string, unknown>
  const id = requireString(entry.id, "id", `models[${position}]`)
  const where = `model ${id}`

  const countMethod = entry.countMethod
  if (countMethod !== "exact" && countMethod !== "estimated") {
    throw new ModelDataError(`${where}: countMethod must be "exact" or "estimated"`)
  }
  // An exact count needs something to count with. Without this, a typo silently
  // downgrades a model to estimates while still claiming to be exact.
  if (countMethod === "exact" && typeof entry.encoding !== "string") {
    throw new ModelDataError(`${where}: countMethod "exact" requires an encoding`)
  }

  const contextWindow = requirePositive(entry.contextWindow, "contextWindow", where)
  let maxOutput: number | undefined
  if (entry.maxOutput !== undefined) {
    maxOutput = requirePositive(entry.maxOutput, "maxOutput", where)
    if (maxOutput > contextWindow) {
      throw new ModelDataError(`${where}: maxOutput cannot exceed contextWindow`)
    }
  }

  return {
    id,
    label: requireString(entry.label, "label", where),
    family: requireString(entry.family, "family", where),
    contextWindow,
    maxOutput,
    inputPerMillion: requireNonNegative(entry.inputPerMillion, "inputPerMillion", where),
    outputPerMillion: requireNonNegative(entry.outputPerMillion, "outputPerMillion", where),
    countMethod,
    encoding: typeof entry.encoding === "string" ? entry.encoding : undefined,
    source: requireString(entry.source, "source", where),
  }
}

export function parseModelTable(value: unknown): ModelTable {
  if (typeof value !== "object" || value === null) {
    throw new ModelDataError("the file must contain an object")
  }
  const table = value as Record<string, unknown>
  const lastUpdated = requireString(table.lastUpdated, "lastUpdated", "table")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) {
    throw new ModelDataError("lastUpdated must be an ISO date, like 2026-09-25")
  }
  if (!Array.isArray(table.models) || table.models.length === 0) {
    throw new ModelDataError("models must be a non-empty array")
  }

  const models = table.models.map(parseModel)
  const seen = new Set<string>()
  for (const model of models) {
    if (seen.has(model.id)) throw new ModelDataError(`duplicate model id ${model.id}`)
    seen.add(model.id)
  }

  return { lastUpdated, note: requireString(table.note, "note", "table"), models }
}

export const MODEL_TABLE: ModelTable = parseModelTable(raw)
export const MODELS: Model[] = MODEL_TABLE.models
export const LAST_UPDATED: string = MODEL_TABLE.lastUpdated

export const DEFAULT_MODEL_ID = "claude-opus-5-5"

export function findModel(id: string): Model | undefined {
  return MODELS.find((model) => model.id === id)
}

/** The model to start on, falling back to the first entry if the default is removed. */
export function defaultModel(): Model {
  return findModel(DEFAULT_MODEL_ID) ?? MODELS[0]
}

/** How much room the answer can have: the output cap, or the window when none is published. */
export function outputCeiling(model: Model): number {
  return model.maxOutput ?? model.contextWindow
}
