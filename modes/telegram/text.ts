type Ctx = { reply: (t: string, o?: object) => Promise<unknown> };

export const clip = (text: string, max = 4000) =>
  text.length <= max ? text : text.slice(0, max) + '\n...[truncated]';

export async function replyMd(ctx: Ctx, text: string) {
  const body = clip(text);
  try {
    await ctx.reply(body, { parse_mode: 'Markdown' });
  } catch {
    await ctx.reply(body); // fallback when Telegram can't parse the markdown
  }
}

export function commandArg(fullText: string, name: string): string {
  return fullText.replace(new RegExp(`^/${name}(@\\w+)?\\s*`, 'i'), '').trim();
}