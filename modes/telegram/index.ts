import { Telegraf } from 'telegraf';
import chalk from 'chalk';
import { WELCOME } from './constants';
import { registerHandlers } from './handlers';

export async function runTelegramMode() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const ownerID = process.env.TELEGRAM_OWNER_ID?.trim();
    if (!token || !ownerID) {
        console.error(chalk.red("\nSet TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_ID in .env\n"));
        return;
    }

    const bot = new Telegraf(token);
    registerHandlers(bot);
    bot.catch((err) => console.error("Bot error:", err));

    await bot.telegram.sendMessage(ownerID, WELCOME, { parse_mode: 'Markdown' });
    console.log(chalk.green("Sent welcome message to Telegram.\n"));

    void bot.launch().catch((e) => console.error("Launch failed:", e));
    console.log(chalk.green("Telegram bot is running. Press Ctrl+C to stop.\n"));

    await new Promise<void>((resolve) => {
        const stop = () => { bot.stop("SIGINT"); resolve(); };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
    });
}