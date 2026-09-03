import { isCancel } from "@clack/core";
import { select } from "@clack/prompts";

import type { ActionTracker } from "./actionTracker";
import type { ActionLog } from "./types";
import { composeBeforeAfter, formatPatch } from "./diff-view";
import chalk from "chalk";
import { renderTerminalMarkdown } from "../../tui/terminal";

//this function we will implement the approval flow for the agent actions.
// All the change

//shape of one group of changes that the user will review
interface ReviewGroup{
    label:string,
    actionIds:string[],

    patch:string|null
}

//all the actions that are pending for approval
function groupPending(pending:ActionLog[]):ReviewGroup[]{
    //action belonging to the same path will be grouped togetherfor review
const bypath=new Map<string,ActionLog[]>();
//holds shell commands
const shells:ActionLog[]=[];

for(const a of pending){
    if(a.type==='tool_execute'){
        shells.push(a);
        continue;
    }
    const key=a.path;
    if(!bypath.has(key)) bypath.set(key, []);
    bypath.get(key)!.push(a);
}

const groups:ReviewGroup[]=[];
const pathEntries=[...bypath.entries()].sort(([a],[b])=>a.localeCompare(b),);
for(const[p,acts]of pathEntries){
    const sorted=acts.sort(
        (a,b)=>a.timestamp.getTime()-b.timestamp.getTime()
    );

    const ids=sorted.map((x)=>x.id);
   if (sorted.every((x) => x.type === "folder_create")) {
      groups.push({
        label: `Create folder: ${p}`,
        actionIds: ids,
        patch: null,
      });
      continue;
    }
    const { before, after } = composeBeforeAfter(sorted);
    const patch = formatPatch(p, before, after);
    const kinds = [...new Set(sorted.map((x) => x.type))].join(", ");
    groups.push({ label: `${p} (${kinds})`, actionIds: ids, patch });
  

}
return groups;
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
            return true;
        }
    }
    for(const g of groupPending(pending)){
        while(true){
            const opt=await select({
                message: chalk.bold(g.label),
                options:[
                    {value:"accept",label:"Accept"},
                    {value:"diff",label:"Show diff",hint:g.patch ? "":"N\A"},
                    {value:"reject",label:"Reject"},
                ],
            })
        
        if(isCancel(opt)){
            for(const a of pending) tracker.updateStatus(a.id,"rejected",false);
            return false;
        }
    
    if(opt==="diff"){
        if(g.patch){
            console.log(
                '\n' + renderTerminalMarkdown('````diff\n' + g.patch + '\n```')
            )
        }
        continue;
    }
    for(const id of g.actionIds){
        tracker.updateStatus(
            id,
            opt==="accept"?"approved":"rejected",
            opt==="accept",
        );
    }
    break;
}
}
return tracker.getAction().some((x)=>x.status==="approved");
    
} 

