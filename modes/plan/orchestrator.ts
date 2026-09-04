import { confirm,isCancel,text } from "@clack/prompts";
import chalk from "chalk";
import { ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai/ai.config";
import { ActionTracker } from "../agent/actionTracker";
import { defaultAgentConfig } from "../agent/types";
import { runApprovalFlow } from "../agent/approval";
import { renderTerminalMarkdown } from "../../tui/terminal";
import { stepCountIs} from "ai";
import { ToolExecutor } from "../agent/ToolExecutor";

export async function runPlanMode():Promise<void>{
    console.log(chalk.bold('\n ⏱️ Plan Mode \n'));
    const goal=await text({message:"What is your goal?"})
    if(isCancel(goal) ||!goal.trim()) return;
    
}