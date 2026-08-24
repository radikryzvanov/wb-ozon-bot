import sharp from "sharp";

// Собирает готовую картинку-инфографику: фото товара + плашка с заголовком
// сверху + плашка с преимуществами снизу. Всё делается программно,
// без Canva и без платных сервисов.
export async function buildInfographic(photoBuffer, title, bullets) {
  const WIDTH = 1080;
  const HEIGHT = 1080;

  // Приводим фото товара к квадрату нужного размера
  const baseImage = await sharp(photoBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .toBuffer();

  const escapeXml = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const bulletLines = bullets
    .map((b, i) => `<text x="60" y="${880 + i * 60}" font-size="34" fill="white" font-family="DejaVu Sans, Arial, sans-serif">✓ ${escapeXml(b)}</text>`)
    .join("\n");

  // SVG-слой с текстом: полупрозрачная плашка сверху под заголовок
  // и снизу под список преимуществ — накладывается поверх фото
  const svgOverlay = `
    <svg width="${WIDTH}" height="${HEIGHT}">
      <rect x="0" y="0" width="${WIDTH}" height="160" fill="black" fill-opacity="0.55" />
      <text x="60" y="95" font-size="48" font-weight="bold" fill="white" font-family="DejaVu Sans, Arial, sans-serif">${escapeXml(title)}</text>

      <rect x="0" y="${HEIGHT - (160 + bullets.length * 60)}" width="${WIDTH}" height="${160 + bullets.length * 60}" fill="black" fill-opacity="0.55" />
      ${bulletLines}
    </svg>
  `;

  return sharp(baseImage)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
}