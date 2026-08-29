import type { Plugin, PluginModule } from "@kilocode/plugin"

export const factoryServerPlugin: Plugin = async () => ({})

const factoryPlugin: PluginModule = {
  id: "kilo-factory",
  server: factoryServerPlugin,
}

export default factoryPlugin
