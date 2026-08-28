//which type of action to perform
export type ActionType=
| 'file_Create'
| 'file_modify'
| 'file_delete'
| 'folder_create'
| 'code_analysis'
| 'tool_execute'

//status of above action
export type ActionStatus='pending' | 'executed' | 'approved' | 'rejected';

//information of action 
// in which path it is executing becuae it is global
//detail have basic thing about action after , before and is there nay error amd all the things
// we have action status if user approved it or not
export interface ActionLog {
    id: string;
    timestamp : Date;
    type : ActionType;
    path :string;
    details: {
        before?: string;// ? means is optional. It may exist, or it may not exist.
        after?: string;
        toolName?: string;
        tooleResult?:string;
        error?: string;
        command?: string; // shell command executed  by agent
    };
    status : ActionStatus;
    userApproved?:boolean;


}
// in this agent config we are checking codebase, file size and whihc files not to read in agent
// tools to give agent to maake change sin file

export interface AgentConfig {
    codebasePath:string;
    maxFileSizeToRead: number;
    excludePatterns: string[];
    tools: {
        allowShellExecution: boolean;
        allowFileModification :boolean;
        allowFileCreation :boolean;
        allowFolderCreation: boolean;
    };
}
// codebase path will be in which directory we are working and using this agent

// we are creating an object of AgentConfig and returing it 
export const defaultAgentConfig=() : AgentConfig=>({
codebasePath:process.cwd(),//(current working directory)
maxFileSizeToRead:1024*1024,
excludePatterns: [
    'node_modules',
    '.git',
    'build',
    '.next',
    '*.log',
    '.env',

],
tools: {
    allowShellExecution: true,
    allowFileModification: true,
    allowFileCreation: true,
    allowFolderCreation: true,
},

})

// to create or update anything
export function isMutationType(t:ActionType): boolean{
    return(
        t==='file_Create'||
        t==='file_modify'||
        t==='file_delete'||
        t==='folder_create'||
        t==='tool_execute'
    );
}