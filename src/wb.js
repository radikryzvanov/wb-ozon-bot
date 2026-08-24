// Обновляет описание карточки на Wildberries через официальный Content API.
// wbToken — личный API-токен продавца (создаётся в его кабинете WB:
// Настройки → Доступ к API, с правами на категорию "Контент").
// nmId — номер карточки товара (виден в личном кабинете WB рядом с товаром).
// newDescription — новый текст описания, который туда вставляем.
export async function updateWbCardDescription(wbToken, nmId, newDescription) {
  // Шаг 1: получаем текущую карточку целиком — WB требует присылать
  // обратно ВСЕ поля карточки, даже если меняем только одно.
  const listResponse = await fetch("https://content-api.wildberries.ru/content/v2/get/cards/list", {
    method: "POST",
    headers: {
      "Authorization": wbToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      settings: {
        filter: { textSearch: String(nmId), withPhoto: -1 },
        cursor: { limit: 1 },
      },
    }),
  });

  if (!listResponse.ok) {
    throw new Error(`Не удалось получить карточку (${listResponse.status}). Проверь токен и nmID.`);
  }

  const listData = await listResponse.json();
  const card = listData?.cards?.find((c) => String(c.nmID) === String(nmId));
  if (!card) {
    throw new Error("Карточка с таким nmID не найдена в этом магазине.");
  }

  // Шаг 2: меняем только описание, остальное оставляем как было
  card.description = newDescription;

  // Шаг 3: отправляем карточку обратно целиком
  const updateResponse = await fetch("https://content-api.wildberries.ru/content/v2/cards/update", {
    method: "POST",
    headers: {
      "Authorization": wbToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([card]),
  });

  if (!updateResponse.ok) {
    const errText = await updateResponse.text();
    throw new Error(`WB отклонил обновление (${updateResponse.status}): ${errText}`);
  }

  return true;
}
