import chalk  from 'chalk';
import {confirm,isCancel, text} from "@clack/prompts";
import {z} from "zod";
import { ToolExecuter } from '../agent/ToolExecuter';
import {ActionTracker} from '../agent/actionTracker';
import{ defaultAgentConfig} from '../agent//types';
import{runApprovalFlow} from '../agent/approval';
import {renderTerminalMarkdown} from '../../tui/terminal';
import {getAgentModel} from '../../ai/ai.config';
import { ToolLoopAgent, stepCountIs } from 'ai';
import fs from 'node:fs'
import path from 'node:path'
function createAskTools(executer:ToolExecuter){
    return{
        
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
            },
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
                    
            
                },
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
                  },
                
                
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
                  },
                  
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
                    },
                  
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
                    },
                  
    }
}
export async function runAskMode(){
    console.log(chalk.bold("\n ASk Mode\n"));
}