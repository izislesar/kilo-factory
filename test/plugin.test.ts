import { describe, expect, test } from "bun:test"
import factoryPlugin, { factoryServerPlugin } from "../src/plugin"

describe("Kilo server plugin entrypoint", () => {
  test("exports the current Kilo server module shape", async () => {
    expect(factoryPlugin.id).toBe("kilo-factory")
    expect(typeof factoryPlugin.server).toBe("function")

    const hooks = await factoryServerPlugin({} as never)
    expect(hooks).toBeDefined()
    expect(typeof hooks).toBe("object")
    expect(hooks.tool).toBeDefined()
    expect(hooks.tool?.factory_job).toBeDefined()
    expect(hooks.tool?.factory_complete).toBeDefined()
    expect(hooks.tool?.factory_block).toBeDefined()
  })
})
