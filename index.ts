#!/usr/bin/env bun
import { Command } from "commander";
import { runWakeup } from "./tui/wakeup";
const program= new Command()
program.name("DevAgent-build")
.description("DevAgent cli ")
.version("0.01")


program.command("wakeup").description("show the banner and pick cli or telegram mode").action(
    async()=>{
         console.log("wakeup calling.......")
        await runWakeup();
       
    }
);
//parses the provides cmd args
 await program.parseAsync(process.argv)