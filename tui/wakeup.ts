import {select ,isCancel} from "@clack/prompts"
import chalk from "chalk"
import figlet from "figlet"

import { runCliMode } from "../modes/cli";
const BANNER_FONT='ANSI shadow';
const SHADOW=chalk.hex('#53459a')
const FACE=chalk.hex('#d3baf5').bold

function printBannerWithShadow(ascii:string){
    const bannerlines=ascii.replace(/\s+$/, '').split('\n');
    const maxLen=Math.max(
        ...bannerlines.map((l) => l.length),0);
    const rowWidth=maxLen+2;
    //print shadow
    for (const line of bannerlines){
        console.log(SHADOW((' '+line).padEnd(rowWidth)));
    }
    //move curser backup
        process.stdout.write(`\x1b[${bannerlines.length}A`);
        //print face
        for(const line of bannerlines){
            console.log(FACE(line.padEnd(rowWidth)));
        }

        console.log()
    }






export async function runWakeup(){

let ascii:string;
try{
    ascii=figlet.textSync("openclaw",{font:BANNER_FONT})
} catch(error){
    ascii=figlet.textSync("openclaw",{font:"Standard"})
}

printBannerWithShadow(ascii)
// after starting this show options
const mode= await select({
    message:"which mode you want to proceed with ?",
    options:[
        {value:"cli",label:"CLI"},
        {value:"telegram",label:"Telegram"},
        {value:"exit",label:"Exit"}
    ]
});
// if user cancel any mode
if(isCancel(mode||mode==="exit")){
   console.log(chalk.dim('\n Goodbye.\n'));
   return;
}
//now options fucntionality
if(mode==="cli"){
    await runCliMode();
    console.log(chalk.dim("starting cli mode........."))
}
else if(mode=="telegram"){
    console.log(chalk.dim("starting telegram"))
}

}