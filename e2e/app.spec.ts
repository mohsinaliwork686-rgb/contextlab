import { expect, test } from "@playwright/test"

/*
 * The happy path, in a real browser against the real build. The logic is covered by the
 * unit tests; these prove the page wires it up: it loads, it counts, it trims, it shares.
 */

test("loads with the sample request and says it fits", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "contextlab" })).toBeVisible()
  await expect(page.getByText("Fits", { exact: true })).toBeVisible()
  await expect(page.getByText("Where the input goes")).toBeVisible()
})

test("recounts a layer as it is edited", async ({ page }) => {
  await page.goto("/")
  const field = page.getByLabel("System prompt", { exact: true })
  const card = page.locator("section").filter({ has: field })
  const before = await card.locator("[aria-live]").textContent()
  await field.fill("A much longer system prompt. ".repeat(40))
  await expect(card.locator("[aria-live]")).not.toHaveText(before ?? "")
})

test("trims an overflowing request and shows where the cut falls", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Load one that overflows" }).click()
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-haiku-4-5")
  await expect(page.getByText("Trimmed to fit")).toBeVisible()
  await expect(page.getByText(/tokens dropped/).first()).toBeVisible()
  await expect(page.getByText("The cut falls here:")).toBeVisible()
})

test("a shared link brings back the same view", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/")
  await page.getByLabel("Model", { exact: true }).selectOption("claude-sonnet-5-5")
  await page.getByLabel("Output reserve", { exact: true }).fill("1234")
  await page.getByLabel("System prompt", { exact: true }).fill("Shared link round trip: café 🎉 日本語")

  // The clipboard only accepts writes from a focused page.
  await page.bringToFront()
  await page.getByRole("button", { name: "Copy link" }).click()
  await expect(page.getByText("Link copied.")).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain("?s=")

  const fresh = await context.newPage()
  await fresh.goto(link)
  await expect(fresh.getByLabel("Model", { exact: true })).toHaveValue("claude-sonnet-5-5")
  await expect(fresh.getByLabel("Output reserve", { exact: true })).toHaveValue("1234")
  await expect(fresh.getByLabel("System prompt", { exact: true })).toHaveValue("Shared link round trip: café 🎉 日本語")
})

test("a mangled link falls back to the sample instead of breaking", async ({ page }) => {
  await page.goto("/?s=1not-a-real-link")
  await expect(page.getByRole("heading", { name: "contextlab" })).toBeVisible()
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-opus-5-5")
  await expect(page.getByText("Fits", { exact: true })).toBeVisible()
})
