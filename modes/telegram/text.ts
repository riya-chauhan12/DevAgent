export const clip=(text:string,max=4000)=>
    text.length<=max?text:text.slice(0,max)+'\n...[truncted]';
 export const replyMd=(ctx:{reply:(t:string,o?:object)=>Promise<unknown>},text:string)=>
    ctx.reply(clip(text),{parse_mode:'Markdown'});

 export function commandArg(fullText:string,name:string):string{
    return fullText.replace(new RegExp(`/${name}\\s*`,'i'), '').trim();
 }