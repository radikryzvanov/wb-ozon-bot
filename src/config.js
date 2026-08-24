import "dotenv/config";

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const UNLOCK_CODE = process.env.UNLOCK_CODE || "";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN не задан в .env");
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY не задан в .env");

// Сколько бесплатных описаний даём каждому человеку
export const FREE_LIMIT = 3;
// Переключатель: true — лимиты и оплата работают, false — бот без ограничений
export const LIMITS_ENABLED = false;

// Список вопросов по порядку: [ключ в data, текст вопроса]
export const QUESTIONS = [
  ["category", "1/4. Какая категория товара? (например: спортивный костюм, кроссовки, чехол для телефона)"],
  ["brand", "2/4. Бренд и материал/состав (если есть)? Если бренда нет — напиши \"без бренда\"."],
  ["features", "3/4. Главные особенности и преимущества товара? (цвет, размеры, для чего подходит, чем отличается от аналогов)"],
  ["keywords", "4/4. Для кого товар и какие ключевые слова важно включить для поиска на маркетплейсе?"],
];
