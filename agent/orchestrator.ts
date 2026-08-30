import { isCancel, text } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./actionTracker";
import { ToolExecuter } from "./ToolExecuter";
import { createAgentTools } from "./agentTool";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../ai/ai.config";
import { convertArrayToReadableStream } from "ai/test";

export async function runAgentModel(){
    console.log(chalk.bold("\n🤖 Agent Mode\n"));
    const goal= await text({
        message:"what would like the agent to work on",
        placeholder:"concentrate task for this codebase...."
    });
    if(isCancel(goal)||!goal.trim()) return;

    const config =defaultAgentConfig();
    const tracker=new ActionTracker()
    const executer=new ToolExecuter(tracker, config)
    const tools=createAgentTools(executer)
    const agent=new ToolLoopAgent({
        model : getAgentModel(),
        stopWhen:stepCountIs(29),
        instructions:[
            `Workspace root:${config.codebasePath}`,
            `All mutation are stagged until approval.`,

        ].join("\n"),
        tools,
    });
     const result=await agent.generate({
        prompt:goal.trim(),
        onStepFinish:({toolCalls})=>{
            for(const tc of toolCalls){
                const preview=JSON.stringify(tc.input).slice(0,160);
                console.log(
                    chalk.green(" ✓"),
                    chalk.bold(String(tc.toolName)),
                    chalk.dim(preview+(preview.length>=160?"....":""))
                );
            }
        },
     })
     if (result.text?.trim()) console.log(result.text);

  


}