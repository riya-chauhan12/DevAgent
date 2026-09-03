import chalk from "chalk";
import { select,isCancel } from "@clack/prompts";
import { runAgentModel } from "./agent/orchestrator";
import { runAskMode } from "./ask/orchestrator";
export async function runCliMode() {
    while(true){
        const mode=await select({
            message:"choose Cli sub mode",
            options:[
                {value:"agent",label:"Agent Mode"},
                {value:"plan",label:"Plan Mode"},
                {value:"ask",label:"Ask Mode"},
                {value:"back",label:"<-Back to main menu"},
            ],
        })
        if(isCancel(mode)||mode==="back"){
            return;

        }
        if(mode==="agent"){
            
            await runAgentModel();
        }
        if(mode==="ask"){
            await runAskMode();
        }
        if(mode==="plan"){
            console.log("plan.......")
        }
        if(mode!=='agent'&& mode!=='plan'&&mode!=='ask'){
            console.log(chalk.yellow('\n That mode is not implemented yet.\n'))
        }
    }
}