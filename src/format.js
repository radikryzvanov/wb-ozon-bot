// Превращает **жирный** и # Заголовки из ответа модели в HTML, понятный Telegram
export function toTelegramHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>")
    .replace(/^---+$/gm, "");
}
