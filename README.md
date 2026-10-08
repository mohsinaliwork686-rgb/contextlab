# contextlab

**Plan your context window before it overflows.** See what fits, what gets cut, and what it costs —
before you send anything.

> Week 3 of a 10-week build. In progress — see
> [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the design.

---

## The problem

A context window is a budget, and almost nobody treats it like one.

You think of "the prompt" as one thing. It is really a stack, and every layer spends from the same
allowance:

| Layer | Typical size |
|-------|--------------|
| System prompt | 200 – 2,000 tokens |
| Tool definitions | 100 – 500 each, and they add up |
| Few-shot examples | 50 – 500 each |
| Retrieved context | often the biggest, 1,000 – 20,000 |
| Conversation history | grows every single turn |
| **Output reserve** | the row everyone forgets |

The failure is quiet. You do not get an error saying "your request was 4,000 tokens too big". You
get an answer that is slightly worse than yesterday's, because a framework silently dropped the
oldest three turns or cut the last retrieved chunk halfway through a sentence. Quality degrades and
nothing in the logs says why.

Then there is cost. Input and output are priced differently, usually several times apart — so a
long prompt with a short answer and a short prompt with a long answer cost very different amounts.
Most people discover that on the invoice.

## What it will do

Paste each layer into its own box. Watch a stacked bar fill against the chosen model's real limit,
one colour per layer, with a live cost figure. Switch model and the bar changes, because limits and
tokenisers differ.

Go over, and it greys out **exactly what would be dropped**, in place, under the truncation policy
you picked — oldest history first, then lowest-ranked chunks, then few-shot examples. Not a warning
that you are over. The specific sentence where the knife falls.

Every view has a URL that reproduces it.

## On honest numbers

Some model families publish a tokenizer that runs locally in the browser. Others do not, and the
only exact count comes from calling the vendor — which this tool will not do, because no API keys
and no network is the entire point.

So counts come in two kinds, and the difference is **visible on screen, never hidden**: exact counts
show as `1,284`, estimates show as `~1,310` with a note saying why. A tool that prints a confident
number it cannot stand behind is worse than one that admits the uncertainty.

## Status

| Day | |
|-----|-|
| Mon | Plan and README ✅ |
| Tue | Scaffold, model data, tokenizer ✅ |
| Wed | Budget allocation, trimming, cost, share links ✅ |
| Thu | Page and components, CI ✅ |
| Fri | Polish, deploy, screenshot, publish |

## Non-goals

- **It never calls a model.** No API keys, no network, no cost to use.
- **No accounts, no history, no backend.** A URL is the only persistence.
- **It is not a tokenizer explorer.** Good ones exist. Counts here serve the budget.
- **It does not optimise your prompt.** It shows you the budget. What to cut is your call.

## License

MIT — see [LICENSE](LICENSE).
