import { isCancel, text } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./actionTracker";
import { ToolExecuter } from "./ToolExecuter";

export async function runAgentModel(){
    console.log(chalk.bold("\n🤖 Agent Mode\n"));
    const goal= await text({
        message:"what would like the agent to work on",
        placeholder:"concentrate task for this codebase...."
    });
    if(isCancel(goal)||!goal.trim()) return;

    const config =defaultAgentConfig();
    const tracker=new ActionTracker()
    const executor=new ToolExecuter(tracker, config)
}