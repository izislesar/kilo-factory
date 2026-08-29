import { describe, expect, test } from "bun:test"
import factoryPlugin, { factoryServerPlugin } from "../src/plugin"

describe("Kilo server plugin entrypoint", () => {
  test("exports the current Kilo server module shape", async () => {
    expect(factoryPlugin).toEqual({
      id: "kilo-factory",
      server: factoryServerPlugin,
    })
    expect(await factoryServerPlugin({} as never)).toEqual({})
  })
})
