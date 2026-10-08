import type { LayerId } from "./budget"

/**
 * What each layer is, and what to show before anyone types.
 *
 * Pure data. Colours are CSS variables rather than hex so light and dark mode swap in
 * one place; their order is the validated palette order and matches the stack order.
 */

export interface LayerSpec {
  id: LayerId
  label: string
  hint: string
  color: string
  placeholder: string
}

export const LAYER_SPECS: LayerSpec[] = [
  {
    id: "system",
    label: "System prompt",
    hint: "Your standing instructions. Paid for on every request, never trimmed.",
    color: "var(--series-1)",
    placeholder: "You are a support assistant for…",
  },
  {
    id: "tools",
    label: "Tool definitions",
    hint: "The JSON schemas the model can call. Charged on every call, and JSON is token-dense.",
    color: "var(--series-2)",
    placeholder: '{"name": "lookup_order", "input_schema": {…}}',
  },
  {
    id: "examples",
    label: "Few-shot examples",
    hint: "Worked examples of the format you want. Trimmed last, from the end.",
    color: "var(--series-3)",
    placeholder: "Q: … A: …",
  },
  {
    id: "retrieved",
    label: "Retrieved context",
    hint: "What retrieval found. Trimmed from the end, where the weakest chunks sit.",
    color: "var(--series-4)",
    placeholder: "Paste the chunks your retriever returned…",
  },
  {
    id: "history",
    label: "Conversation history",
    hint: "Everything said so far. Trimmed first, oldest turns first.",
    color: "var(--series-5)",
    placeholder: "user: …\nassistant: …",
  },
]

export const OUTPUT_COLOR = "var(--series-6)"

export const DEFAULT_OUTPUT_RESERVE = 4000

const SYSTEM = `You are the support assistant for Meridian Supply Co. Answer using only the policy excerpts provided in the context. If the excerpts do not cover the question, say so and offer to hand the conversation to a person. Keep answers under 120 words. Never promise a refund amount or a delivery date that the excerpts do not state.`

const TOOLS = JSON.stringify(
  [
    {
      name: "lookup_order",
      description: "Fetch an order by its id, including status, items and delivery estimate.",
      input_schema: {
        type: "object",
        properties: { order_id: { type: "string", description: "The order id, e.g. MS-48213" } },
        required: ["order_id"],
      },
    },
    {
      name: "open_ticket",
      description: "Hand the conversation to a person. Use when policy does not cover the request.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "urgent"] },
        },
        required: ["summary", "priority"],
      },
    },
  ],
  null,
  2,
)

const EXAMPLES = `Q: Can I return an opened item?
A: Returns need the item unused and in its original packaging, so an opened item usually does not qualify. If it arrived faulty, I can open a ticket for the warehouse team to assess it.

Q: Where is my order MS-48213?
A: Let me look that up for you. [calls lookup_order]`

const RETRIEVED = `[1] Refunds are processed within five business days of approval and returned to the original payment method. Store credit is not issued in place of a refund unless requested.

[2] Any refund above five hundred dollars requires a team manager to sign off before finance releases it. The person raising the request cannot approve it.

[3] Returns must be started within fourteen days of delivery and need an RMA number. Parcels arriving without one are held and cannot be matched to an order.`

const HISTORY_TURN = `user: I was charged twice for order MS-48213 and I would like the duplicate refunded.
assistant: I'm sorry about that. I can see two charges on MS-48213. A duplicate charge qualifies for a refund, which finance processes within five business days of approval.
`

export const SAMPLE: Record<LayerId, string> = {
  system: SYSTEM,
  tools: TOOLS,
  examples: EXAMPLES,
  retrieved: RETRIEVED,
  history: `${HISTORY_TURN}user: The duplicate was $740. Does that need anyone to approve it?`,
}

/**
 * A request that overruns a 200K window, generated at runtime.
 *
 * Built by repetition when asked for, rather than stored, so it costs nothing in the
 * bundle. Its job is to show the trimming, which a small request never triggers.
 */
export function overflowingSample(): Record<LayerId, string> {
  const turns: string[] = []
  for (let index = 1; index <= 2600; index += 1) {
    turns.push(HISTORY_TURN.replace("MS-48213", `MS-${48213 + index}`))
  }
  turns.push("user: So, to confirm — who approves the refund on my original order?")
  return { ...SAMPLE, history: turns.join("") }
}
