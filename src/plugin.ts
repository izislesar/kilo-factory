import { tool } from "@kilocode/plugin"
import { z } from "zod"
import type { Plugin, PluginModule, ToolResult } from "@kilocode/plugin"

const BRANCH_PREFIX = "factory/"

function isFactorySessionID(sessionID: string): boolean {
  return sessionID.startsWith("ses_")
}

function parseJobFromBranch(branch: string): { jobId: string; generation: number } | null {
  if (!branch.startsWith(BRANCH_PREFIX)) return null
  const rest = branch.slice(BRANCH_PREFIX.length)
  const slash = rest.lastIndexOf("/")
  if (slash === -1) return null
  const jobId = rest.slice(0, slash)
  const genStr = rest.slice(slash + 1)
  if (!/^\d+$/.test(genStr)) return null
  return { jobId, generation: parseInt(genStr, 10) }
}

const factoryJobTool = tool({
  description: "Returns the exact immutable factory job identity and generation for this session.",
  args: {},
  execute: async (_args, context): Promise<ToolResult> => {
    const branch = context.worktree
    const match = branch.match(/factory\/([^/]+)\/(\d+)$/)
    if (!match) {
      return { output: JSON.stringify({ error: "not_a_factory_job", worktree: branch }) }
    }
    return {
      output: JSON.stringify({
        jobId: match[1],
        generation: parseInt(match[2], 10),
        sessionID: context.sessionID,
      }),
    }
  },
})

const factoryCompleteTool = tool({
  description: "Signal completion for the current factory job.",
  args: {
    jobId: z.string(),
    generation: z.number().int(),
    summary: z.string(),
    checks: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    headSha: z.string(),
  },
  execute: async (args, context): Promise<ToolResult> => {
    const expected = parseJobFromBranch(context.worktree)
    if (!expected || expected.jobId !== args.jobId || expected.generation !== args.generation) {
      return {
        output: JSON.stringify({
          ok: false,
          error: "job_mismatch",
          expected: expected ? `${expected.jobId}:${expected.generation}` : null,
          received: `${args.jobId}:${args.generation}`,
        }),
      }
    }
    return {
      output: JSON.stringify({
        ok: true,
        jobId: args.jobId,
        generation: args.generation,
        summary: args.summary,
        checks: args.checks,
        risks: args.risks,
        headSha: args.headSha,
      }),
    }
  },
})

const factoryBlockTool = tool({
  description: "Signal that the current factory job is blocked.",
  args: {
    jobId: z.string(),
    generation: z.number().int(),
    reason: z.string(),
    class: z.enum(["transient", "persistent", "external"]),
  },
  execute: async (args, context): Promise<ToolResult> => {
    const expected = parseJobFromBranch(context.worktree)
    if (!expected || expected.jobId !== args.jobId || expected.generation !== args.generation) {
      return {
        output: JSON.stringify({
          ok: false,
          error: "job_mismatch",
          expected: expected ? `${expected.jobId}:${expected.generation}` : null,
          received: `${args.jobId}:${args.generation}`,
        }),
      }
    }
    return {
      output: JSON.stringify({
        ok: true,
        jobId: args.jobId,
        generation: args.generation,
        reason: args.reason,
        class: args.class,
      }),
    }
  },
})

export const factoryServerPlugin: Plugin = async (input) => {
  return {
    tool: {
      factory_job: factoryJobTool,
      factory_complete: factoryCompleteTool,
      factory_block: factoryBlockTool,
    },
    event: async ({ event }) => {
      const props = (event as { properties?: { sessionID?: string } }).properties
      if (props?.sessionID && !isFactorySessionID(props.sessionID)) {
        return
      }
    },
  }
}

const factoryPlugin: PluginModule = {
  id: "kilo-factory",
  server: factoryServerPlugin,
}

export default factoryPlugin
