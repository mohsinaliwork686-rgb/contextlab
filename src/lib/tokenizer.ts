import type { CountMethod, Model } from "./models"

/**
 * Token counting.
 *
 * Models read tokens, not characters. For English prose a token is roughly four
 * characters, but that average hides a lot: digits, CJK text and emoji all cost far
 * more per character than Latin prose does, and a budget that ignores this is wrong
 * in exactly the cases where being wrong matters.
 *
 * This is an approximation and the interface says so. A model whose vendor publishes
 * a tokenizer that runs locally can carry `countMethod: "exact"`; nothing in the
 * shipped table does yet, so every count here is marked as an estimate.
 *
 * It errs high on ordinary prose, landing nearer 3.3 characters per token than 4. For a
 * budget planner that is the safe direction: planning for more than you spend leaves
 * headroom, while planning for less silently truncates.
 */

export interface TokenCount {
  tokens: number
  method: CountMethod
}

/** Letters-with-marks, digit runs, or a single other character. Whitespace is handled apart. */
const PIECE = /\p{L}[\p{L}\p{M}'’]*|\p{N}+|[^\s\p{L}\p{N}]/gu

const DIGITS = /^\p{N}+$/u

/** Han, Hiragana, Katakana, Hangul. These tokenise close to one token per character. */
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/u

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

/** Characters per token for ordinary Latin prose, the usual rule of thumb. */
const LATIN_CHARS_PER_TOKEN = 4

/** Digits group more tightly than letters do. */
const DIGIT_CHARS_PER_TOKEN = 3

/** CJK runs a little over one token per character. */
const CJK_TOKENS_PER_CHAR = 1.2

/** An emoji is usually two or more tokens, and more again with modifiers. */
const TOKENS_PER_PICTOGRAPH = 2

/** Length in characters, not UTF-16 units: an emoji is one character, not two. */
function codePointLength(piece: string): number {
  return [...piece].length
}

function piecesInto(piece: string): number {
  if (DIGITS.test(piece)) {
    return Math.ceil(piece.length / DIGIT_CHARS_PER_TOKEN)
  }
  if (PICTOGRAPHIC.test(piece)) {
    return codePointLength(piece) * TOKENS_PER_PICTOGRAPH
  }
  if (CJK.test(piece)) {
    return Math.ceil(codePointLength(piece) * CJK_TOKENS_PER_CHAR)
  }
  // Short words are a single token; longer ones split roughly every four characters.
  return piece.length <= LATIN_CHARS_PER_TOKEN
    ? 1
    : Math.ceil(piece.length / LATIN_CHARS_PER_TOKEN)
}

/**
 * Approximate the token count of a string.
 *
 * `calibration` scales the result for a family that is known to run heavier or lighter
 * than the default assumptions. It defaults to 1, meaning no adjustment.
 */
export function estimateTokens(text: string, calibration = 1): number {
  if (!text) return 0
  if (calibration <= 0) throw new RangeError("calibration must be greater than zero")

  let total = 0
  for (const match of text.matchAll(PIECE)) {
    total += piecesInto(match[0])
  }

  // A newline is its own token, and leading indentation usually joins it. Counted by
  // code unit rather than by character: it is the same answer and avoids walking the
  // string a second time as code points.
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) total += 1
  }

  return Math.round(total * calibration)
}

/** Count a string for one model, reporting whether the number is exact or approximate. */
export function countTokens(text: string, model: Model): TokenCount {
  // When a model gains a locally runnable tokenizer, this is where it hooks in: load
  // the encoding named by `model.encoding` and return `{ method: "exact" }`.
  return { tokens: estimateTokens(text), method: model.countMethod }
}

/** Render a count the way it should appear on screen: approximate numbers wear a tilde. */
export function formatTokens(count: TokenCount, locale?: string): string {
  const rendered = count.tokens.toLocaleString(locale ?? "en-US")
  return count.method === "exact" ? rendered : `~${rendered}`
}
