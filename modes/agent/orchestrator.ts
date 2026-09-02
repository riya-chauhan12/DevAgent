import { isCancel, text } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./actionTracker";
import { ToolExecuter } from "./ToolExecuter";
import { createAgentTools } from "./agentTool";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai/ai.config";
import { convertArrayToReadableStream } from "ai/test";
import { renderTerminalMarkdown } from "../../tui/terminal";
import { runApprovalFlow } from "./approval";

// this function It connects all the pieces together and starts the agent loop.
export async function runAgentModel(){
    console.log(chalk.bold("\n🤖 Agent Mode\n"));
    // first user give the goal to agent
    const goal= await text({
        message:"what would like the agent to work on",
        placeholder:"concentrate task for this codebase...."
    });
    // check if user cancel or if not then trim goal after tirm "" empty string is falsy
    if(isCancel(goal)||!goal.trim()) return;

    //creates your configuration object
    const config =defaultAgentConfig();

    //It keeps track of actions performed by the agent.
    const tracker=new ActionTracker()

    //This is the thing that actually interacts with the filesystem.
    const executer=new ToolExecuter(tracker, config)
    
    const tools=createAgentTools(executer)
  
    //ToolLoopAgent is specifically a abstraction class/API provided by Vercel's AI SDK
// toolloop is like  think-> choose tool-> calltool->see reault-> think again-> choose another tool
    const agent=new ToolLoopAgent({
        // call llm
        model : getAgentModel(),
        // prevent agent from running forever
        stopWhen:stepCountIs(29),
        instructions:[
            `Workspace root:${config.codebasePath}`,
            `All mutation are stagged until approval.`,

        ].join("\n"),
        tools,
    });
    // genrate() provided by ai sdk Start the agent's work
    
     const result=await agent.generate({
        prompt:goal.trim(),
            // callback function genrate calls internally
        onStepFinish:({toolCalls})=>{
            //that goes through all the tool calls it receives and prints them.
            for(const tc of toolCalls){
                //JSON.stringify() converts a JavaScript object into a string.
                // this slice creatingre a small preview of the tool for file content
                const preview=JSON.stringify(tc.input).slice(0,160);
                console.log(
                    chalk.green(" ✓"),
                    chalk.bold(String(tc.toolName)),
                    chalk.dim(preview+(preview.length>=160?"....":""))
                );
            }
        },
     })
     if (result.text?.trim()) console.log(renderTerminalMarkdown(result.text));
     
     const ok = await runApprovalFlow(tracker);
      if(!ok) return executer.clearStaging();
      const {errors}=executer.applyApprovedFromTracker();
      if(errors.length){
        console.log(chalk.red("\n Some operation reported errors:\n"));
        for(const e of errors) console.log(chalk.red(` -${e}`))
      }
    else{
        console.log(chalk.green("\n Applied.\n"))
    }
    // to free memory and avoid accidental re application of the same actions;
    executer.clearStaging();

  


}
// ToolLoopAgent
//      │
//      │ contains/uses the agent logic
//      ↓
// generate()
//      │
//      │ internally runs the loop
//      ↓
// LLM
//      ↓
// tool
//      ↓
// LLM
//      ↓
// tool
//      ↓
// LLM
//      ↓
// final result
// ┌─────────────────────────────┐
// │        generate()           │
// │                             │
// │  1. Give prompt to model    │
// │  2. Model chooses tool      │
// │  3. Execute tool            │
// │  4. Call onStepFinish       │
// │  5. Give result to model    │
// │  6. Model chooses next tool │
// │  7. Execute tool            │
// │  8. Call onStepFinish       │
// │  9. Repeat                  │
// │ 10. Generate final answer   │
// │                             │
// └─────────────────────────────┘
//               │
//               ↓
//            result