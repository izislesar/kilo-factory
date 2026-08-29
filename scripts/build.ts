import { chmod, rm } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const outdir = join(root, "dist")
await rm(outdir, { recursive: true, force: true })

for (const entrypoint of ["cli", "plugin"]) {
  const result = await Bun.build({
    entrypoints: [join(root, "src", `${entrypoint}.ts`)],
    outdir,
    target: "bun",
    banner: entrypoint === "cli" ? "#!/usr/bin/env bun" : undefined,
  })
  if (!result.success) throw new AggregateError(result.logs, `Failed to build ${entrypoint}`)
}

await chmod(join(outdir, "cli.js"), 0o755)
