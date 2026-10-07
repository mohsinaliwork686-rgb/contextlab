import { LAYER_ORDER, type LayerId } from "./budget"

/**
 * Putting the page state in a URL.
 *
 * A realistic request is tens of kilobytes, which does not fit comfortably in a link, so
 * the state is gzipped before it is encoded. The browser supplies the compressor, which
 * is why there is no dependency here.
 *
 * The first character of the encoded value names the scheme, so a link made today still
 * opens after the format changes:
 *
 *   "1" gzip, then base64url
 *   "0" base64url alone, for a browser with no CompressionStream
 */

export interface SharedLayer {
  id: LayerId
  text: string
}

export interface SharedState {
  modelId: string
  outputReserve: number
  layers: SharedLayer[]
}

const SCHEME_GZIP = "1"
const SCHEME_RAW = "0"

/**
 * How long a link may get before the page offers a file instead.
 *
 * Browsers themselves cope with far more, but links are pasted into chat clients, issue
 * trackers and email, and those wrap or truncate well before the browser limit. Better
 * to say so than to hand someone a link that silently breaks in transit.
 */
export const URL_PARAM_LIMIT = 1800

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  // Chunked: spreading a large array into String.fromCharCode overflows the call stack.
  const CHUNK = 0x8000
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function hasCompression(): boolean {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function"
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function encodeState(state: SharedState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state))
  if (!hasCompression()) return SCHEME_RAW + toBase64Url(json)
  return SCHEME_GZIP + toBase64Url(await gzip(json))
}

/** True when the encoded state is long enough that a link may not survive being pasted. */
export function isTooLongForUrl(encoded: string): boolean {
  return encoded.length > URL_PARAM_LIMIT
}

function isLayerId(value: unknown): value is LayerId {
  return typeof value === "string" && (LAYER_ORDER as string[]).includes(value)
}

/**
 * Validate a decoded payload.
 *
 * Anything a stranger can edit has to be checked. A link is the one part of this that
 * other people touch, and a crash on a mangled one is the failure they would see.
 */
function parseState(value: unknown): SharedState | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>

  if (typeof candidate.modelId !== "string" || candidate.modelId === "") return null
  if (
    typeof candidate.outputReserve !== "number" ||
    !Number.isFinite(candidate.outputReserve) ||
    candidate.outputReserve < 0
  ) {
    return null
  }
  if (!Array.isArray(candidate.layers)) return null

  const layers: SharedLayer[] = []
  for (const entry of candidate.layers) {
    if (typeof entry !== "object" || entry === null) return null
    const layer = entry as Record<string, unknown>
    if (!isLayerId(layer.id) || typeof layer.text !== "string") return null
    layers.push({ id: layer.id, text: layer.text })
  }

  return { modelId: candidate.modelId, outputReserve: candidate.outputReserve, layers }
}

/** Decode a shared link. Returns null for anything malformed, so the page falls back. */
export async function decodeState(encoded: string): Promise<SharedState | null> {
  if (typeof encoded !== "string" || encoded.length < 2) return null

  const scheme = encoded[0]
  const body = encoded.slice(1)
  if (scheme !== SCHEME_GZIP && scheme !== SCHEME_RAW) return null

  try {
    const bytes = fromBase64Url(body)
    const json = scheme === SCHEME_GZIP ? await gunzip(bytes) : bytes
    return parseState(JSON.parse(new TextDecoder().decode(json)))
  } catch {
    return null
  }
}
