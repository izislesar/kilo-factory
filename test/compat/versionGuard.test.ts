import { describe, expect, test } from "bun:test"
import { checkCompatibility, createVersionGuard } from "../../src/compat/versionGuard"

describe("version guard", () => {
  test("passes when version matches required range", async () => {
    const guard = createVersionGuard("7.5.6", "7.5.6")
    const result = await guard.check()

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("fails when version is below required range", async () => {
    const guard = createVersionGuard("7.0.0", "7.5.6")
    const result = await guard.check()

    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test("assert throws on unsupported version", async () => {
    const guard = createVersionGuard("7.0.0", "7.5.6")
    await expect(guard.assert()).rejects.toThrow("Kilo version/capability check failed")
  })

  test("checks required capabilities", async () => {
    const guard = createVersionGuard("7.5.6", "7.5.6")
    const result = await guard.check()

    expect(result.capabilities.length).toBeGreaterThan(0)
    expect(result.capabilities.every((c: { ok: boolean }) => c.ok)).toBe(true)
  })
})
