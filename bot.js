import { Bot, session } from "grammy";
import { BOT_TOKEN } from "./src/config.js";
import { registerHandlers, initialSession } from "./src/commands.js";

const bot = new Bot(BOT_TOKEN);
bot.use(session({ initial: initialSession }));

registerHandlers(bot);

async function main() {
  console.log("Запускаем ИИ-бота...");
  await bot.start();
}

main();
