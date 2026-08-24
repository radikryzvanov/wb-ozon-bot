// Обновляет описание товара на Ozon через официальный Seller API.
// clientId, apiKey — берутся продавцом в его личном кабинете Ozon
// (Настройки → Seller API → создать ключ).
// productId — идентификатор товара (виден в личном кабинете рядом с товаром).
export async function updateOzonProductDescription(clientId, apiKey, productId, newDescription) {
  const response = await fetch("https://api-seller.ozon.ru/v1/product/update", {
    method: "POST",
    headers: {
      "Client-Id": clientId,
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: Number(productId),
      description: newDescription,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ozon отклонил обновление (${response.status}): ${errText}`);
  }

  return true;
}
