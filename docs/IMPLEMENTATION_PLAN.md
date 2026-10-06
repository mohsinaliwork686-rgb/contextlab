# Implementation plan — contextlab

> Written Monday 5 October 2026, before any code.
> Week 3 of the 10-week programme.

## 1. Problem

A context window is a budget, and almost nobody treats it like one.

People think of "the prompt" as one thing. It is really a stack, and every layer spends from the
same allowance: the system prompt, the tool definitions, the few-shot examples, whatever RAG
retrieved, the conversation so far, and the space the answer itself needs.

The failure is quiet. You do not get an error that says "your request was 4,000 tokens too big".
You get an answer that is slightly worse than yesterday's, because a framework silently dropped
the oldest three turns, or truncated the last retrieved chunk halfway through a sentence. Quality
degrades and nothing in the logs says why.

The other half of the problem is cost. Input and output are priced differently, usually several
times apart, so a long prompt with a short answer and a short prompt with a long answer cost very
different amounts. People discover this on the invoice.

`contextlab` makes the budget visible before you send anything: what fits, what gets cut, what it
costs, and how all three change when you switch model.

## 2. Non-goals

- **It never calls a model.** No API keys, no network, no cost to use. Everything happens in the
  browser.
- **No accounts, no saved history, no backend.** A URL is the only persistence.
- **It is not a tokenizer explorer.** Good ones exist. Token counts here serve the budget; they
  are not the product.
- **It does not optimise your prompt.** It shows you the budget. What to cut is your call.

## 3. Surface

The whole thing is one page.

A column of layers, each with a text box and a live token count:

| Layer | Why it is separate |
|-------|--------------------|
| System prompt | Fixed cost on every single request |
| Tool definitions | Pasted as JSON. Easy to forget these are charged on every call |
| Few-shot examples | Each one added separately, so you can see what the fourth example costs |
| Retrieved context | Usually the biggest and the most variable |
| Conversation history | The one that grows until something breaks |
| Output reserve | A number, not text. The row everyone forgets |

Next to it: a stacked bar against the chosen model's real limit, one colour per layer, and a cost
figure. Change the model and the bar changes, because limits and tokenisers differ.

When the total goes over, the bar shows the overflow and the app says which layer crossed the line
and by how much, under the truncation policy you picked.

Every view has a URL that reproduces it.

## 4. Architecture

```
  src/lib/        pure TypeScript, no React, no DOM
    models.ts     one data file: context limit, pricing, tokenizer family
    tokenizer.ts  text -> token count, exact where possible
    budget.ts     layers + model -> allocation, overflow, what gets cut
    cost.ts       tokens -> money
    share.ts      state <-> URL
         |
         v
  src/components/ display only. They render what lib/ returns
  src/app/        one page, holds the state, wires the two together
```

**The rule: `lib/` contains no React and no browser-only APIs beyond the ones it declares.** Every
rule the app enforces is a pure function from data to data. That is what lets vitest cover the
behaviour properly and leaves Playwright with one job: prove the page loads and renders.

### 4.1 The tokenizer decision

This is the call that defines the project's credibility.

Some model families publish a tokenizer you can run locally in the browser. Others do not, and the
only exact count comes from a network call to the vendor — which this tool refuses to make, because
"no API keys, no network" is the whole point.

So counts come in two kinds, and **the difference is visible in the interface, never hidden**:

| Kind | How | Shown as |
|------|-----|----------|
| Exact | The family's real BPE tokenizer, run locally | `1,284` |
| Estimated | Character and whitespace heuristic, calibrated per family | `~1,310` with a tooltip saying why |

A tool that prints a confident number it cannot stand behind is worse than one that admits the
uncertainty. Every model entry therefore carries `countMethod: "exact" | "estimated"`, and the UI
reads it rather than assuming.

### 4.2 Bundle size

**Changed on the Tuesday, when the model table was written.** The shipped table contains
only models whose numbers could be verified against a primary source, and none of those
families publishes a tokenizer that runs locally in a browser — their exact counts come
from a vendor endpoint this tool will not call. So nothing in the table is `"exact"` yet,
and pulling in a BPE library plus its ranks table would add roughly a megabyte and a half
to the bundle for code that nothing currently exercises.

The `countMethod` field, the `encoding` field and its validation all stay, and
`countTokens` has a single documented place where the exact path hooks in. It gets built
when a model that needs it is added, not before. The rest of this section still describes
how it will work when that happens.

A real BPE tokenizer ships a large ranks table. Loading that before the page can render would make
the first paint slow for a tool whose entire value is being quick to reach for.

So: **the estimator is synchronous and always available; the exact tokenizer loads lazily on first
use.** The page renders immediately with estimates, then upgrades the numbers in place once the
encoder arrives. A small indicator shows which kind is currently on screen.

This also means the app still works if the encoder fails to load — it degrades to estimates rather
than to a blank screen.

### 4.3 Truncation policy

The differentiator. Being told "you are 4,000 tokens over" is mildly useful. Being shown *what
would actually be dropped* is the thing nobody else does.

Each layer gets a priority. When the total exceeds the window minus the output reserve, layers are
trimmed from the lowest priority upward until it fits. The default order mirrors what real
frameworks do: oldest conversation history first, then lowest-ranked retrieved chunks, then
few-shot examples. The system prompt and tool definitions are never trimmed, because dropping them
changes what the model is.

The UI greys out what would be cut, in place, so you can see the exact sentence where the knife
falls.

Policy is data, not code — a list of layer ids in trim order — so a different ordering is a config
change, not a rewrite.

### 4.4 Sharing

State goes into the URL so a link reproduces the view.

The problem: a realistic request is tens of kilobytes of text, and that does not fit comfortably in
a URL. The options were a shortener service (needs a backend — against the non-goals), storing only
the counts (loses the thing you wanted to share), or compression.

**Decision: compress with the browser's built-in `CompressionStream` (gzip), then base64url.** No
dependency, and prose compresses well. When the result is still too long for a URL, the app says so
plainly and offers a JSON download instead of producing a link that silently breaks in Slack.

Fallback: if `CompressionStream` is unavailable, store uncompressed and warn earlier.

## 5. Data model

```ts
type LayerId = "system" | "tools" | "examples" | "retrieved" | "history"

interface Layer {
  id: LayerId
  label: string
  text: string
  trimmable: boolean   // system and tools are not
}

interface Model {
  id: string
  label: string
  family: string
  contextWindow: number
  maxOutput: number
  inputPerMillion: number
  outputPerMillion: number
  countMethod: "exact" | "estimated"
  encoding?: string    // only when countMethod is "exact"
}

interface Allocation {
  perLayer: { id: LayerId; tokens: number; kept: number; dropped: number }[]
  outputReserve: number
  total: number
  limit: number
  overflowBy: number        // 0 when it fits
  firstLayerOverLimit: LayerId | null
  cost: { input: number; output: number; total: number }
}
```

`budget.ts` is one function: `allocate(layers, model, outputReserve, policy) -> Allocation`.
Everything on screen is a rendering of that one return value.

## 6. Pricing data goes stale

It will. Prices change and a tool quoting last quarter's numbers is worse than one quoting none.

**Decision: one JSON file with a `lastUpdated` date, shown in the page footer**, and a line in the
README saying a pull request updating it is welcome. That turns the weakness into the easiest
possible first contribution for a stranger, which is also how a repo picks up its first outside
commit.

The file is validated at build time, so a malformed edit fails CI rather than producing a page with
`NaN` in the cost column.

## 7. Build order

| Day | Work |
|-----|------|
| **Mon** | This plan. README pitch. Commit both before any code |
| **Tue** | Scaffold Next.js and Tailwind. `models.ts` with the data file and its validator, `tokenizer.ts` with the estimator and the lazy exact path. Tests as I go |
| **Wed** | `budget.ts` — allocation, overflow, trimming — and `cost.ts`. This is the logic, so it gets the most test time. Then `share.ts` with the compression round trip |
| **Thu** | The page and components. Then CI: typecheck, lint, vitest, build |
| **Fri** | Polish, one Playwright happy path, screenshot, deploy, README with the real screenshot, publish |

Components come late on purpose. If `lib/` is right, the components are thin; if `lib/` is wrong,
building the UI first just means building it twice.

## 8. Test plan

| Area | Must work | Must not break |
|------|-----------|----------------|
| `tokenizer` | estimator within a sane margin of a known count; exact path agrees with published counts | empty string; emoji and combining characters; very large input does not block the main thread |
| `models` | every entry validates; `encoding` present whenever `countMethod` is `exact` | a malformed entry fails the validator loudly, with the model id in the message |
| `budget` | fits exactly; one token over; output reserve larger than the window; empty layers | trimming never touches a non-trimmable layer; trimming stops as soon as it fits; `overflowBy` is 0 when it fits |
| `cost` | input and output priced separately, against hand-worked figures | zero tokens; a model with zero price does not produce `NaN` |
| `share` | encode then decode returns the original state | unicode survives; a corrupt or truncated parameter loads the default state instead of crashing; oversized state is reported, not silently mangled |
| page | loads, renders a bar, updates on typing | one Playwright test only |

The `share` round trip and the "corrupt parameter does not crash" case matter most. A shared link
is the one part of this that other people touch, and a crash there is the failure a stranger sees.

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Exact tokenizer bundle makes first paint slow | Estimator renders immediately; exact loads lazily and upgrades in place. Not shipped yet — see 4.2 |
| Model table covers one vendor, so the tool looks narrow | Every entry carries a source link and the schema is documented; adding a vendor is a data edit, and the README asks for exactly that |
| Pricing drifts and the tool misleads | `lastUpdated` on screen, validated at build, PRs invited |
| Estimates presented as if they were exact | `countMethod` is on every model and the UI marks estimates with `~` |
| Large input freezes the browser while counting | Debounce input; count off the critical path; cap single-layer size with a clear message |
| Scope creeps into prompt optimisation | It is in the non-goals. The tool shows the budget and stops |

## 10. Definition of done

- [ ] Public repo, description and topics
- [ ] This plan, committed before the code
- [ ] README with the problem, a real screenshot, the live URL, usage and non-goals
- [ ] Deployed and the URL set as the repo website
- [ ] vitest covering the table in section 8, one Playwright happy path
- [ ] CI green: typecheck, lint, test, build
- [ ] Works on a phone, and with the exact tokenizer blocked
- [ ] At least 10 commits, one logical change each
