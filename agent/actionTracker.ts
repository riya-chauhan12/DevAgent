import type {ActionLog, ActionStatus} from "./types"
import { isMutationType } from "./types"

export class ActionTracker{
    //ActionLog is only a type and array is supposed to contain ActionLog objects
    private actions :ActionLog[]=[];
// all the entry id and timestamp
    log(
        //Omit is a built-in TypeScript utility type.
        //it ignore id and timestamp
        entry:Omit<ActionLog,'id'| 'timestamp'>&{
            id?:string;
            timestamp?: Date;
        },
    ):ActionLog {
    const action:ActionLog={
        //If the user supplied an ID, use it. Otherwise generate one.
        id: entry.id??`action_${this.actions.length}`,
        timestamp:entry.timestamp?? new Date(),
        type:entry.type,
        path:entry.path,
        details:{ ...entry.details},
        status:entry.status,
        userApproved:entry.userApproved,


    
    };
    this.actions.push(action);
    return action;
     }
    
     getAction():readonly ActionLog[]{
        // read the action and return that
        return this.actions;

    }

    // this gives pending status
    getPendingMutations():ActionLog[]{
        return this.actions.filter(
            (a)=>isMutationType(a.type) && a.status==="pending"
        )
    }
    // we want to update status form pending
    updateStatus(id:string ,status:ActionStatus,userApproved?:boolean):void{
        const a=this.actions.find((x)=>x.id===id);
        if(!a) return;
        a.status= status;
        if(userApproved!==undefined) a.userApproved =userApproved;
    }
}