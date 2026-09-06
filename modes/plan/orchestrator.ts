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
import { generatePlan } from "./planner";
import { selectSteps } from "./selection";
import { printPlan } from "./selection";
import { createAgentTools } from "../agent/agentTool";
import type { PlanStep } from "./types";

function stepPrompt(goal :string, step:PlanStep):string{
    return [`goal:${goal}`,`step:${step.title}`,step.description].join('\n');
}
export async function runPlanMode():Promise<void>{
    console.log(chalk.bold('\n ⏱️ Plan Mode \n'));
    const goal=await text({message:"What is your goal?"})
    if(isCancel(goal) ||!goal.trim()) return;
    
    const plan=await generatePlan(goal);
    
    printPlan(plan);
    const selected=await selectSteps(plan)
    if(selected.length===0) return ;
    const procceed =await confirm({
        message :`Execute $ {selected.length} steps(s)`,
        initialValue:true
    });
    const config=defaultAgentConfig();
     const tracker=new ActionTracker();
      const executor=new ToolExecutor(tracker, config)
 const tools={

 ...createAgentTools(executor)
 }
 for(const step of selected){
    console.log(chalk.bold(`\n 🛠️ ${step.title} \n`))
    const agent =new ToolLoopAgent({
        model:getAgentModel(),
        stopWhen:stepCountIs(30),
        tools
    });
    const r=await agent.generate({prompt:stepPrompt(plan.goal , step)})
    if(r.text) return console.log(renderTerminalMarkdown(r.text))
}
const ok =await runApprovalFlow(tracker);
if(!ok) return executor.clearStaging();
const { errors }= executor.applyApprovedFromTracker();
if(errors.length){
    console.log(chalk.red('\nSome operations reported errors :\n'));
    for(const e of errors) console.log(chalk.red(` .${e}`));
}else{
    for(const e of errors) console.log(chalk.green('\n✔️ Applied \n'))
    }
executor.clearStaging();

}