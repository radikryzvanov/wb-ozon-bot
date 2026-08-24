import { Bot, session } from "grammy";
import { BOT_TOKEN } from "./src/config.js";
import { registerHandlers, initialSession } from "./src/commands.js";

const bot = new Bot(BOT_TOKEN);
bot.use(session({ initial: initialSession }));

registerHandlers(bot);

// Регистрируем список команд в Telegram — тогда при вводе "/" в чате
// будет появляться подсказка со всеми командами и их описанием
await bot.api.setMyCommands([
  { command: "start", description: "Составить описание карточки товара" },
  { command: "infographic", description: "Сделать инфографику по фото товара" },
  { command: "publish_wb", description: "Опубликовать описание на Wildberries" },
  { command: "publish_ozon", description: "Опубликовать описание на Ozon" },
  { command: "status", description: "Сколько бесплатных попыток осталось" },
  { command: "unlock", description: "Ввести код после оплаты" },
  { command: "cancel", description: "Отменить текущий диалог" },
]);

async function main() {
  console.log("Запускаем ИИ-бота...");
  await bot.start();
}

main();