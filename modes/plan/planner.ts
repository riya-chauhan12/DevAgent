import { Output, 
    extractJsonMiddleware,
    generateText,
    stepCountIs,
    tool,
     wrapLanguageModel,
     
 } from "ai";
 import chalk from "chalk";
 import {z } from 'zod'
 import { getAgentModel } from "../../ai/ai.config";
 import { ActionTracker} from "../agent/actionTracker";
 import { defaultAgentConfig } from "../agent/types";
 import type { PlanStep } from "./types";
 import type { Plan } from "./types";
 import { ToolExecutor } from "../agent/ToolExecutor";
import { createWebTools } from "./web-tools";


  const planSchema=z.object({
    researchSummary: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        hints: z.array(z.string()).optional(),
        complexity: z.enum(["low", "medium", "high"]).optional(),
      }),
    )
    .min(1)
    .max(15),
});


type PlanJson = z.infer<typeof planSchema>;

function readOnlyTools(executor:ToolExecutor){
    return {
        read_file: tool({
            description:
                "Read a text from a workspace. Use a path relative to the project root.",
            inputSchema: z.object({
                path: z.string().describe("Relative file path")
            }),
            execute: async ({ path: p }) => executor.readFile(p),
        }),
       
      list_files: tool({
      description: "List files and directories under a path.",
      inputSchema: z.object({
        path: z.string(),
        recursive: z.boolean().optional().default(false),
      }),
      execute: async ({ path: p, recursive }) =>
        executor.listFiles(p, recursive),
    }),

      search_files: tool({
      description:
        'Find files matching a glob pattern (e.g. "*.ts", "**/*.md"). Optional content substring filter.',
      inputSchema: z.object({
        root: z.string().describe("Directory to search, relative to root"),
        pattern: z
          .string()
          .describe("Glob-like pattern using * and ** (forward slashes)"),
        content_contains: z.string().optional(),
      }),
      execute: async ({ root, pattern, content_contains }) =>
        executor.searchFiles(root, pattern, content_contains),
    }),

    analyze_codebase: tool({
      description:
        "Summarize structure: file counts, size, extensions. Read-only.",
      inputSchema: z.object({
        path: z.string().default("."),
      }),
      execute: async ({ path: p }) => executor.analyzeCodebase(p),
    }),
    list_skills: tool({
      description:
        "List absolute paths to SKILL.md files under configured skill directories (Cursor / Claude).",
      inputSchema: z.object({}),
      execute: async () => executor.listSkills(),
    }),
     read_skill: tool({
      description:
        "Read a SKILL.md file. Path must be absolute and under skill roots, or use a path returned by list_skills.",
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: async ({ path: p }) => executor.readSkill(p),
    }),

    };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in model reply");
  return candidate.slice(start, end + 1);
}
 
const JSON_ONLY_SYSTEM = [
  "You turn research notes into a plan.",
  "Reply with ONLY a JSON object. No markdown, no explanation, no code fences.",
  'Shape: {"researchSummary": string, "steps": [{"title": string, "description": string, "hints": string[], "complexity": "low" | "medium" | "high"}]}',
  "1 to 15 steps.",
].join("\n");

const PLAN_INSTRUCTIONS = (codebase: string, hasWeb: boolean) =>
  [
    "You are a Plan-Mode planner. You DO NOT modify files.",
    `Workspace: ${codebase}`,
    "Use the read-only tools to inspect the real codebase before answering. Do not guess.",
    hasWeb
      ? "Web tools are available (web_search/web_crawl/fetch_url). Use only when needed."
      : "Web tools are unavailable (no FIRECRAWL_API_KEY).",
    "When you have enough information, write short research notes in plain text.",
  ].join("\n");
  

  export async function generatePlan(goal: string) {
  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);
 
  const hasWeb = !!process.env.FIRECRAWL_API_KEY;
  const tools = { ...readOnlyTools(executor), ...(hasWeb ? createWebTools(tracker) : {}) };
 
  console.log(chalk.cyan("\n🔍 Researching the codebase...\n"));
 
  // Phase 1: research with tools, plain text out (no structured output here,
  // many models cannot do tools + JSON schema in the same call)
  const research = await generateText({
    model: getAgentModel(),
    tools,
    stopWhen: stepCountIs(15),
    system: PLAN_INSTRUCTIONS(config.codebasePath, hasWeb),
    prompt: `User goal: ${goal}\n\nInspect the codebase with the tools, then write short research notes.`,
  });
  const notes = research.text?.trim() || "(no notes)";
 
  console.log(chalk.cyan("📝 Drafting the plan...\n"));
 
  const prompt = `User goal: ${goal}\n\nResearch notes:\n${notes}`;
  let validated: PlanJson | undefined;
 
  // Phase 2a: structured output (works on models that support response_format)
  try {
    const r = await generateText({
      model: wrapLanguageModel({ model: getAgentModel(), middleware: extractJsonMiddleware() }),
      system: JSON_ONLY_SYSTEM,
      prompt,
      output: Output.object({ schema: planSchema }),
    });
    validated = planSchema.parse(r.output);
  } catch {
    // Phase 2b: fallback, ask for plain JSON text and parse it ourselves
    try {
      const r = await generateText({
        model: getAgentModel(),
        system: JSON_ONLY_SYSTEM,
        prompt,
      });
      validated = planSchema.parse(JSON.parse(extractJson(r.text)));
    } catch (e) {
      throw new Error(
        `The model "${process.env.OPENROUTER_DEFAULT_MODEL}" did not return a valid plan. ` +
          `Try a stronger model in .env. (${(e as Error).message})`,
      );
    }
  }
 
  const steps: PlanStep[] = validated.steps.map((s, i) => ({
    id: `step-${i + 1}`,
    title: s.title,
    description: s.description,
    hints: s.hints,
    complexity: s.complexity ?? "medium",
  }));
 
  return { goal, researchSummary: validated.researchSummary, steps };
}
 