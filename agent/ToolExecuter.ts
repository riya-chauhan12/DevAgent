// use nodejs internal packages (@types/nodes)
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import type { ActionLog, AgentConfig } from './types'
import { ActionTracker } from './actionTracker'

//Keep a list of file extensions that we consider to be text files
const TEXT_EXT=new Set([
    '.ts',
    '.tsx',
    '.js',
    '.mjs',
    '.jsx',
    '.cjs',
    '.json',
    '.md',
    '.mdx',
    '.css',
    '.html',
    '.yml',
    '.yaml',
    '.toml',
    '.txt'
]);

// to check if the give file path is text or not
function isProbablyTextFile(filepath: string):boolean {
    const ext=path.extname(filepath).toLowerCase();
    return TEXT_EXT.has(ext)||ext==='';
}

//bridge between  the ai tools and real file system

export class ToolExecuter{
    // through overlay we have  stagged changes and kept in map
    private overlay=new Map<string,string>();
    //delete the staged things
    private deleted =new Set<string>();

    //Normalize a relative path so that the program has one consistent representation of it
    // becuase  Windows and Unix use different separators for ex=(/,\)
     private readonly norm =(rel:string)=>{
        return path.posix.normalize(rel.split(path.sep).join("/")).replace(/^\.\/+/, "");
     }
     // typescript syntax is basically shorthand for creating properties.
    constructor(
        private readonly tracker:ActionTracker,
        private readonly config:AgentConfig
    ){}
   
    //It converts the relative path into an absolute path.
    // ex= workspace
    // C:\Users\hp\projects\Openclaw  
    //rel:src\index.ts becomes = C:\Users\hp\projects\Openclaw\src\index.ts
    private resolveSafe(rel:string): string {
        const abs=path.resolve(this.config.codebasePath,rel);
        const root= path.resolve(this.config.codebasePath);
        const relCheck=path.relative(root,abs);
        if(relCheck.startsWith('..')||path.isAbsolute(relCheck)){
            throw new Error(`path escapes workspace ${rel}`);
        }
        return abs;

    }


    //it function is basically a security/filter function for your ToolExecuter
    //Given a file path, decide whether the agent should exclude it from reading/modifying.
    private excluded (relPath:string): boolean{
        //normalizing the path using the the norm function
        const norm=this.norm(relPath);
        
        // split path into pieces
        // then get the last element 
        const segments= norm.split('/');
        const base =segments[segments.length-1]?? '';
        //loop through the 
        for(const pat of this.config.excludePatterns){

            if(pat==='*.log' && base.endsWith('.log')) return true;
            if(pat ==='.env' && base.startsWith('.env')) return true;
            if(pat.includes('*')) continue;

            if(segments.includes(pat)|| norm === pat|| norm.startsWith(`${pat}/`))
                return true;

        }
        return false;

    }

    // checks if file is exculded
    // relative path and operation name
    private assertNotExcluded(rel: string, op:string): void{
        if(this.excluded(rel)){
            throw new Error (`${op}: path is exclude by policy : ${rel}`);
        }
    }

    //
    getEffectiveText(rel:string): string | undefined {
        const key= this.norm(rel);
        // check if file deleted
         if(this.deleted.has(key)) return undefined;
         //If I have a newer version of this file stored in memory, return that version
          if(this.overlay.has(key)) return this.overlay.get(key);
          // if the file wasn't deleted and isn't overlay
          const abs= this.resolveSafe(rel);
          //exitsSync tells Does something exist at this path?
          //statSync() gets information about the filesystem item.for example (the path could point to:src/index.ts)
          // isFile() tells you if it is actually a file
           if(!fs.existsSync(abs) ||  !fs.statSync(abs).isFile()) return undefined;
           //This reads the file from your actual disk.
            return fs.readFileSync(abs,'utf-8');

    }

    readFile(rel:string) :string {
        this.assertNotExcluded(rel,'read_file')
        const abs=this.resolveSafe(rel);
        if(!fs.existsSync(abs) ||!fs.statSync(abs).isFile()){
            throw new Error(`File not found ${rel}`)
        }
        const st=fs.statSync(abs);
        if(st.size>this.config.maxFileSizeToRead){
            throw new Error(`file too larage :${rel}`)

        }
        const text= fs.readFileSync(abs,"utf8");
         this.tracker.log({
            type:"code_analysis",
            path:this.norm(rel),
            details:{after:text,toolName:"read_file"},
            status:"executed",
         })

         return text;
    }

     createFile(rel:string,content:string) :string {

        if(!this.config.tools.allowFileCreation){
            throw new Error(`File creation disabled`)
        }
        this.assertNotExcluded(rel,'create_file')

        const key = this.norm(rel);
        const abs=this.resolveSafe(rel);
        if(!fs.existsSync(abs) ||!this.deleted.has(key)){
            throw new Error(`create file already exists ${rel}`)
        }
        this.deleted.delete(key);
         this.overlay.set(key,content);
         this.tracker.log({
            type: "file_Create",
            path:key,
            details:{after: content},
            status:"pending",
         })
         return `staged new file:${key}`;
    }
    
    

}