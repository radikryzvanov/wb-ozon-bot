// Простое хранилище использования по пользователям (в памяти процесса).
// Важно: при перезапуске бота (например, после git push) счётчики обнулятся —
// для старта это нормально, позже можно заменить на настоящую базу данных.
const usage = new Map(); // userId -> { used: number, unlocked: boolean }

export function getUserUsage(userId) {
  if (!usage.has(userId)) {
    usage.set(userId, { used: 0, unlocked: false });
  }
  return usage.get(userId);
}
