import { describe, expect, it } from "vitest"

import {
  URL_PARAM_LIMIT,
  decodeState,
  encodeState,
  isTooLongForUrl,
  type SharedState,
} from "@/lib/share"

const state: SharedState = {
  modelId: "claude-opus-5-5",
  outputReserve: 4000,
  layers: [
    { id: "system", text: "You are a careful assistant." },
    { id: "retrieved", text: "Refunds are processed within five business days." },
  ],
}

describe("round trip", () => {
  it("returns what went in", async () => {
    expect(await decodeState(await encodeState(state))).toEqual(state)
  })

  it("survives unicode", async () => {
    const unicode: SharedState = {
      ...state,
      layers: [{ id: "system", text: "café 🎉 日本語 — naïve ‘quotes’" }],
    }
    expect(await decodeState(await encodeState(unicode))).toEqual(unicode)
  })

  it("survives an empty layer list", async () => {
    const empty: SharedState = { ...state, layers: [] }
    expect(await decodeState(await encodeState(empty))).toEqual(empty)
  })

  it("survives a long document", async () => {
    const long: SharedState = {
      ...state,
      layers: [{ id: "retrieved", text: "The quick brown fox. ".repeat(2000) }],
    }
    expect(await decodeState(await encodeState(long))).toEqual(long)
  })

  it("keeps an output reserve of zero", async () => {
    const zero: SharedState = { ...state, outputReserve: 0 }
    expect((await decodeState(await encodeState(zero)))?.outputReserve).toBe(0)
  })
})

describe("compression", () => {
  it("marks the gzip scheme", async () => {
    expect((await encodeState(state))[0]).toBe("1")
  })

  it("produces url-safe output only", async () => {
    const encoded = await encodeState({
      ...state,
      layers: [{ id: "system", text: "slashes / plus + equals = ".repeat(50) }],
    })
    expect(encoded).toMatch(/^[0-9A-Za-z_-]+$/)
  })

  it("makes repetitive text far smaller than it started", async () => {
    const repetitive: SharedState = {
      ...state,
      layers: [{ id: "retrieved", text: "the same sentence again. ".repeat(500) }],
    }
    const raw = JSON.stringify(repetitive).length
    expect((await encodeState(repetitive)).length).toBeLessThan(raw / 5)
  })
})

describe("length guard", () => {
  it("accepts a short link", async () => {
    expect(isTooLongForUrl(await encodeState(state))).toBe(false)
  })

  it("flags a link that will not survive being pasted", async () => {
    // Random text does not compress, which is the realistic worst case.
    const noise = Array.from({ length: 40000 }, () =>
      String.fromCharCode(33 + Math.floor(Math.random() * 90)),
    ).join("")
    const encoded = await encodeState({ ...state, layers: [{ id: "retrieved", text: noise }] })
    expect(isTooLongForUrl(encoded)).toBe(true)
    expect(encoded.length).toBeGreaterThan(URL_PARAM_LIMIT)
  })

  it("still decodes a link that is over the limit", async () => {
    const big: SharedState = { ...state, layers: [{ id: "history", text: "x".repeat(200000) }] }
    const encoded = await encodeState(big)
    expect(await decodeState(encoded)).toEqual(big)
  })
})

describe("a mangled link falls back instead of crashing", () => {
  it("rejects an empty string", async () => {
    expect(await decodeState("")).toBeNull()
  })

  it("rejects a bare scheme with no payload", async () => {
    expect(await decodeState("1")).toBeNull()
  })

  it("rejects an unknown scheme", async () => {
    expect(await decodeState("9abcdef")).toBeNull()
  })

  it("rejects characters that are not base64url", async () => {
    expect(await decodeState("1not valid!!")).toBeNull()
  })

  it("rejects a truncated payload", async () => {
    const encoded = await encodeState(state)
    expect(await decodeState(encoded.slice(0, Math.floor(encoded.length / 2)))).toBeNull()
  })

  it("rejects valid base64 that is not gzip", async () => {
    expect(await decodeState("1aGVsbG8gd29ybGQ")).toBeNull()
  })

  it("rejects valid json that is not a state object", async () => {
    const encoded = "0" + btoa('{"something":"else"}').replace(/=+$/, "")
    expect(await decodeState(encoded)).toBeNull()
  })

  it("rejects an unknown layer id", async () => {
    const encoded =
      "0" + btoa('{"modelId":"m","outputReserve":0,"layers":[{"id":"ghost","text":"x"}]}')
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    expect(await decodeState(encoded)).toBeNull()
  })

  it("rejects a negative output reserve", async () => {
    const encoded =
      "0" + btoa('{"modelId":"m","outputReserve":-5,"layers":[]}')
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    expect(await decodeState(encoded)).toBeNull()
  })

  it("rejects layers that are not an array", async () => {
    const encoded =
      "0" + btoa('{"modelId":"m","outputReserve":0,"layers":"none"}')
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    expect(await decodeState(encoded)).toBeNull()
  })
})

describe("the uncompressed fallback", () => {
  it("decodes a scheme-0 link, for a browser with no compression", async () => {
    const payload = JSON.stringify(state)
    const encoded =
      "0" + btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    expect(await decodeState(encoded)).toEqual(state)
  })
})
