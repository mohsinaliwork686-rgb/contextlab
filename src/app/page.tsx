"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"

import { AllocationTable } from "@/components/AllocationTable"
import { CompositionBar } from "@/components/CompositionBar"
import { LayerEditor } from "@/components/LayerEditor"
import { ModelPicker } from "@/components/ModelPicker"
import { ShareControls } from "@/components/ShareControls"
import { StatTiles } from "@/components/StatTiles"
import { WindowMeter } from "@/components/WindowMeter"
import { LAYER_ORDER, allocate, type Layer, type LayerId } from "@/lib/budget"
import { DEFAULT_OUTPUT_RESERVE, LAYER_SPECS, SAMPLE, overflowingSample } from "@/lib/layers"
import { MODEL_TABLE, defaultModel, findModel, outputCeiling } from "@/lib/models"
import { decodeState, type SharedState } from "@/lib/share"

export default function Page() {
  const [modelId, setModelId] = useState(defaultModel().id)
  const [outputReserve, setOutputReserve] = useState(DEFAULT_OUTPUT_RESERVE)
  const [texts, setTexts] = useState<Record<LayerId, string>>(SAMPLE)

  // Typing stays responsive on a large paste: the allocation trails the input slightly
  // rather than blocking each keystroke on a recount.
  const deferredTexts = useDeferredValue(texts)

  // A shared link restores its state; anything malformed falls back to the sample.
  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get("s")
    if (!encoded) return
    decodeState(encoded).then((shared) => {
      if (!shared) return
      if (findModel(shared.modelId)) setModelId(shared.modelId)
      setOutputReserve(shared.outputReserve)
      const restored = Object.fromEntries(LAYER_ORDER.map((id) => [id, ""])) as Record<LayerId, string>
      for (const layer of shared.layers) restored[layer.id] = layer.text
      setTexts(restored)
    })
  }, [])

  const model = findModel(modelId) ?? defaultModel()

  const layers: Layer[] = useMemo(
    () => LAYER_SPECS.map((spec) => ({ id: spec.id, label: spec.label, text: deferredTexts[spec.id] })),
    [deferredTexts],
  )

  const allocation = useMemo(() => allocate(layers, model, outputReserve), [layers, model, outputReserve])

  const shareState: SharedState = {
    modelId,
    outputReserve,
    layers: LAYER_ORDER.map((id) => ({ id, text: texts[id] })),
  }

  function loadOverflow() {
    setModelId("claude-haiku-4-5")
    setTexts(overflowingSample())
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">contextlab</h1>
        <p className="mt-2 text-ink-2">
          Plan your context window before it overflows. See what fits, what gets cut, and what it
          costs. Everything runs in your browser; nothing you paste leaves it.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-4">
          <ModelPicker
            model={model}
            outputReserve={outputReserve}
            outputCeiling={outputCeiling(model)}
            onModelChange={setModelId}
            onReserveChange={setOutputReserve}
          />

          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setTexts(SAMPLE)} className="rounded-md border border-[var(--border)] bg-surface px-2.5 py-1 text-ink-2 hover:text-ink">
              Load the sample
            </button>
            <button type="button" onClick={loadOverflow} className="rounded-md border border-[var(--border)] bg-surface px-2.5 py-1 text-ink-2 hover:text-ink">
              Load one that overflows
            </button>
            <button
              type="button"
              onClick={() => setTexts(Object.fromEntries(LAYER_ORDER.map((id) => [id, ""])) as Record<LayerId, string>)}
              className="rounded-md border border-[var(--border)] bg-surface px-2.5 py-1 text-ink-2 hover:text-ink"
            >
              Clear everything
            </button>
          </div>

          {LAYER_SPECS.map((spec) => (
            <LayerEditor
              key={spec.id}
              spec={spec}
              text={texts[spec.id]}
              entry={allocation.perLayer.find((entry) => entry.id === spec.id)}
              method={model.countMethod}
              onChange={(value) => setTexts((current) => ({ ...current, [spec.id]: value }))}
            />
          ))}
        </div>

        {/* On a phone the answer comes first; on a wide screen it sits beside the inputs. */}
        <aside className="order-first space-y-5 lg:order-none lg:sticky lg:top-6 lg:self-start">
          <StatTiles allocation={allocation} />

          <div className="space-y-5 rounded-lg border border-[var(--border)] bg-surface p-4">
            <WindowMeter allocation={allocation} />
            <CompositionBar allocation={allocation} />
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-surface p-4">
            <AllocationTable allocation={allocation} />
          </div>

          <ShareControls state={shareState} />
        </aside>
      </div>

      <footer className="mt-12 border-t border-hairline pt-6 text-xs text-ink-3">
        <p>
          Prices last checked {MODEL_TABLE.lastUpdated}. {MODEL_TABLE.note}{" "}
          Counts marked <span className="text-ink-2">~</span> are estimates: these models do not
          publish a tokenizer that runs in a browser, and contextlab never sends your text anywhere
          to get an exact one.
        </p>
      </footer>
    </main>
  )
}
