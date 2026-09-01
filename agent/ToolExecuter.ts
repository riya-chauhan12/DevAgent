// use nodejs internal packages (@types/nodes)
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import type { ActionLog, AgentConfig } from './types'
import { ActionTracker } from './actionTracker'
import { dir } from 'node:console'
import { OpenRouterImageModel } from '@openrouter/ai-sdk-provider/internal'

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
    
    modifyFile(rel:string,content:string): string{
        if(!this.config.tools.allowFileModification){
            throw new Error("file modification disabled");
        }
            this.assertNotExcluded(rel,"modify_file");
            const before=this.getEffectiveText(rel);
            if(before===undefined){
                throw new Error(`modify_file:file not found:${rel}`);
            }
                const key=this.norm(rel);
                 this.overlay.set(key,content);
                  this.tracker.log({
                    type:"file_modify",
                    path:key,
                    details:{before,after:content},
                    status:"pending",
                  });
                  return `staged update :${key}`;

            }
    

    DeleteFile(rel:string):string{
        if(!this.config.tools.allowFileModification){
            throw new Error("file deletion disabled");
        }
        this.assertNotExcluded(rel,"delete_file");
        const before=this.getEffectiveText(rel);
         if(before===undefined){
            throw new Error(`delete_file: file not found:${rel}`)
         }
        const key= this.norm(rel);
        this.overlay.delete(key);
        this.deleted.add(key);
        this.tracker.log({
            type:"file_delete",
            path: key,
            details:{before},
            status:"pending"
        })
        return `staged delete:${key}`
    }

    createFolder(rel:string):string{
        if(!this.config.tools.allowFileCreation){
            throw new Error("folder creation disabled");
            
        }
        this.assertNotExcluded(rel,"create_folder");
        const key=this.norm(rel);
         this.tracker.log({
            type:"folder_create",
            path: key,
            details:{after:key},
            status:"pending",
         })
         return`stagged folder:${key}`;
    }
    listFiles(rel:string,recursive:boolean): string{
        this.assertNotExcluded(rel,"list_files");
        const abs=this.resolveSafe(rel);
        if(!fs.existsSync(abs)){
             throw new Error (`list_files:not found: ${rel}`)
        }
        const lines:string[]=[];
        const walk=(dir:string,prefix:string)=>{
            const entries=fs.readdirSync(dir,{withFileTypes:true});
            for(const ent of entries){
                 const full=path.join(dir,ent.name);
                 const relP=path.relative(this.config.codebasePath,full);
                  if(this.excluded(relP)) continue;
                  if(ent.isDirectory()){
                    lines.push(`${prefix}${ent.name}/`);
                    if(recursive) walk(full,`${prefix}${ent.name}/`);
                  }
                  else{
                    lines.push(`${prefix}${ent.name}`);
                  }

            }
        }
        if(fs.statSync(abs).isDirectory())walk(abs,"");
        else lines.push(path.relative(this.config.codebasePath,abs));
        const out=lines.sort().join("/n");
        this.tracker.log({
            type:"code_analysis",
            path: this.norm(rel),
            details:{after:out,toolName:"list_files"},
            status:"executed",
        })
        return out || "(empty)";
        

    }

    searchFiles(
        rootRel:string,
        globPattern:string,
        contentQuery?:string
    ): string {
        this.assertNotExcluded(rootRel,"search_Files");
        const rootabs=this.resolveSafe(rootRel);
         if(!fs.existsSync(rootabs)){
            throw new Error(`search_Files:root not found:${rootRel}`)

        }

    const results:string[]=[];
    
    const regexFromGlob = (g: string): RegExp => {
      const escaped = g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "§§")
        .replace(/\*/g, "[^/\\\\]*")
        .replace(/§§/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${escaped}$`, "i");
    };
    const nameRe = regexFromGlob(globPattern.replace(/\\/g, "/"));

    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path
          .relative(this.config.codebasePath, full)
          .split(path.sep)
          .join("/");
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) walk(full);
        else if (nameRe.test(relP) || nameRe.test(ent.name)) {
          if (contentQuery) {
            if (!isProbablyTextFile(full)) continue;
            const text = fs.readFileSync(full, "utf8");
            if (!text.includes(contentQuery)) continue;
          }
          results.push(relP);
        }

      }
    };
    
     if (fs.statSync(rootabs).isDirectory()) walk(rootabs);
    else {
      const relP = path
        .relative(this.config.codebasePath, rootabs)
        .split(path.sep)
        .join("/");
      results.push(relP);
    }

    const out = [...new Set(results)].sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: out || "(no matches)", toolName: "search_files" },
      status: "executed",
    });
    return out || "(no matches)";
  }


  analyzeCodebase(rootRel: string): string {
    const rootAbs = this.resolveSafe(rootRel);
    if (!fs.existsSync(rootAbs))
      throw new Error(`analyze_codebase: not found: ${rootRel}`);

    let files = 0;
    let dirs = 0;
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full);
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          dirs++;
          walk(full);
        } else {
          files++;
        }
      }
    };
    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else files = 1;

    const summary = `Files: ${files} | Directories: ${dirs}`;
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: summary, toolName: "analyze_codebase" },
      status: "executed",
    });
    return summary;
  }


  queueShell(command: string): string {
    if (!this.config.tools.allowShellExecution)
      throw new Error("Shell execution disabled");
    this.tracker.log({
      type: "tool_execute",
      path: "shell",
      details: { command, toolName: "execute_shell" },
      status: "pending",
    });
    return `Shell queued: ${command}`;
  }
  
  skillRoots(): string[] {
    const extra =
      process.env.SKILLS_DIRS?.split(/[;]/)
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    return [
      ...extra,
      path.join(homedir(), ".cursor/skills-cursor"),
      path.join(homedir(), ".claude/skills"),
    ];
  }

  listSkills(): string {
    const lines: string[] = [];
    for (const root of this.skillRoots()) {
      if (!fs.existsSync(root)) continue;
      const walk = (dir: string) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full);
          else if (ent.name === "SKILL.md") lines.push(full);
        }
      };
      walk(root);
    }
    const out = lines.sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: "skills",
      details: { after: out || "(none)", toolName: "list_skills" },
      status: "executed",
    });
    return out || "(none)";
  }

  readSkill(skillPath: string): string {
    const abs = path.isAbsolute(skillPath)
      ? path.normalize(skillPath)
      : path.normalize(path.resolve(this.config.codebasePath, skillPath));
    const allowed = this.skillRoots().some((root) => {
      const r = path.resolve(root);
      return abs === r || abs.startsWith(r + path.sep);
    });
    if (!allowed) throw new Error("read_skill: outside skill roots");
    const text = fs.readFileSync(abs, "utf8");
    this.tracker.log({
      type: "code_analysis",
      path: abs,
      details: { after: text, toolName: "read_skill" },
      status: "executed",
    });
    return text;
  }

  //commit approved changes to the real file system
  // it returns a object that include  errors whihc contain array of string that occurred during the commit process.

  applyApprovedFromTracker(): { errors: string[] } {
    const errors: string[] = [];
    //creates a new array containing those actions 
    const all = [...this.tracker.getAction()];

    for (const a of all.filter(
      (x) => x.type === "folder_create" && x.status === "approved",
    )) {
      try {

        // fs  Create a directory/folder.
        
        fs.mkdirSync(this.resolveSafe(a.path), { recursive: true });
      } catch (e) {
        errors.push(String(e));
      }
    }
    // this filters  all approved file operations.(ignores reject or pending)
    // then use sort to sort operation based on timestamp(oldest to  newest)

    const fileOps = all
      .filter(
        (a) =>
          (a.type === "file_Create" ||
            a.type === "file_modify" ||
            a.type === "file_delete") &&
          a.status === "approved",
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      //create a map to store the last approved operation for each file path.
      //map do not have duplicate key,Only the latest approved action for each file remains.
    const lastByPath = new Map<string, ActionLog>();
    //populate the map with the actions

    for (const a of fileOps) lastByPath.set(this.norm(a.path), a);

    for (const [p, a] of lastByPath) {
      try {
        if (a.type === "file_delete")
          // if action is file delte fs.rmSync() removes the file.
          fs.rmSync(this.resolveSafe(p), { force: true });
        else {
          // create ot modify file,path.dirname(target) gets the parent directory.
          const target = this.resolveSafe(p);
          fs.mkdirSync(path.dirname(target), { recursive: true });
         //actual modification  after contain the file should look like after the change.
         // if after is empty we write empty string so we don't get undefined 
          fs.writeFileSync(target, a.details.after ?? "", "utf8");
        }
      } catch (e) {
        errors.push(String(e));
      }
    }

//All approved tool_execute actions(like nom install ,npm test etc) are executed in the order they were approvved
    for (const a of all.filter(
      (x) => x.type === "tool_execute" && x.status === "approved",
    )) {

      const cmd = a.details.command;
      // if cmd doesnt exit skip  the iteration
      if (!cmd) continue;
      // this part run terminal command
      const r = spawnSync(cmd, {
        shell: true,
        cwd: this.config.codebasePath,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (r.status && r.status !== 0)
        errors.push(`shell exit ${r.status}: ${cmd}`);
    }

    return { errors };
  }


  clearStaging():void{
    this.overlay.clear()
    this.deleted.clear()
  }

}