"use client"

import { formatCost } from "@/lib/cost"
import { LAST_UPDATED, MODELS, type Model } from "@/lib/models"

interface ModelPickerProps {
  model: Model
  outputReserve: number
  outputCeiling: number
  onModelChange: (id: string) => void
  onReserveChange: (value: number) => void
}

export function ModelPicker({ model, outputReserve, outputCeiling, onModelChange, onReserveChange }: ModelPickerProps) {
  const reserveTooHigh = outputReserve > outputCeiling

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <label htmlFor="model" className="block text-xs text-ink-3">Model</label>
        <select
          id="model"
          value={model.id}
          onChange={(event) => onModelChange(event.target.value)}
          className="mt-1 block w-full rounded-md border border-[var(--border)] bg-surface px-2.5 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--series-1)]"
        >
          {MODELS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-3">
          {model.contextWindow.toLocaleString("en-US")} token window ·{" "}
          {formatCost(model.inputPerMillion)} in / {formatCost(model.outputPerMillion)} out per million ·{" "}
          <a href={model.source} target="_blank" rel="noreferrer" className="underline decoration-hairline underline-offset-2 hover:text-ink-2">
            prices as of {LAST_UPDATED}
          </a>
        </p>
      </div>

      <div>
        <label htmlFor="reserve" className="block text-xs text-ink-3">Output reserve</label>
        <input
          id="reserve"
          type="number"
          min={0}
          step={500}
          value={outputReserve}
          onChange={(event) => onReserveChange(Math.max(0, Number(event.target.value) || 0))}
          aria-describedby="reserve-hint"
          className="tabular mt-1 block w-full rounded-md border border-[var(--border)] bg-surface px-2.5 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--series-1)] sm:w-36"
        />
        <p id="reserve-hint" className="mt-1 text-xs text-ink-3">
          {reserveTooHigh
            ? `Above this model's ${outputCeiling.toLocaleString("en-US")} output cap`
            : "Room left for the answer"}
        </p>
      </div>
    </div>
  )
}
