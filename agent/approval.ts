import { isCancel } from "@clack/core";
import { select } from "@clack/prompts";

import type { ActionTracker } from "./actionTracker";
import type { ActionLog } from "./types";
import { composeBeforeAfter } from "./diff-view";

//this function we will implement the approval flow for the agent actions.
// All the change

interface ReviewGroup{
    label:string,
    actionIds:string[],

    patch:string|null
}
function groupPending(pending:ActionLog[]):ReviewGroup[]{
const bypath=new Map<string,ActionLog[]>();
const shells:ActionLog[]=[];

for(const a of pending){
    if(a.type==='tool_execute'){
        shells.push(a);
        continue;
    }
}
const groups:ReviewGroup[]=[];
const pathEntries=[...bypath.entries()].sort(([a],[b])=>a.localeCompare(b));
for(const[p,acts]of pathEntries){
    const sorted=acts.sort((a,b)=>a.timestamp.getTime()-b.timestamp.getTime());
    const ids=sorted.map((x)=>x.id);
    if(sorted.length>1){
        
        const {before,after}=composeBeforeAfter(sorted);

        
    }

}
}
export async function runApprovalFlow(tracker:ActionTracker):Promise<boolean>{
    const pending=tracker.getPendingMutations();
    if(pending.length==0){
        console.log("\n NO pending file, folder,or shell changes to write")
        return false;
    }
    const choice =await select({
        message:"Select an action to review",
        options:[
            {value:"all",label:"Approve and apply all"},
            {value:"select",label:"Review one by one"},
            {value:"cancel", label:"Cancel "}
        ],

    })
    if(isCancel(choice)|| choice==="cancel"){
        for(const a of pending){
            tracker.updateStatus(a.id,"rejected",false);
        }
        return false;
    }
    if(choice==="all"){
        for(const a of pending){
             tracker.updateStatus(a.id,"approved",false);

        }
    }
    

    
} 