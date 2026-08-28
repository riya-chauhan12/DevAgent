#!/usr/bin/env bun
import { Command } from "commander";
import { runWakeup } from "./tui/wakeup";
const program= new Command()
program.name("OPENclaw-build")
.description("OPENclaw cli yt")
.version("0.01")


program.command("wakeup").description("show the banner and pick cli or telegram mode").action(
    async()=>{
         console.log("wakeup calling.......")
        await runWakeup();
       
    }
);
 await program.parseAsync(process.argv)