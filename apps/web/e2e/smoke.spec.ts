import { expect, test } from '@playwright/test';

/** Сквозной сценарий MVP: проблема → выдача → профиль → заявка (демо-режим). */
test('клиент находит мастера по описанию проблемы и отправляет заявку', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').fill('разбил экран айфон 13 про');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?/);
  await expect(page.getByText('Мы поняли запрос')).toBeVisible();

  await page.getByRole('article').first().getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.request.post('/api/v1/auth/demo', { data: { role: 'client' } });
  await page.reload();
  await page.getByRole('button', { name: 'Оставить заявку' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('кабинет мастера доступен только мастеру', async ({ page }) => {
  await page.goto('/cabinet');
  await expect(page).toHaveURL(/\/login\?next=%2Fcabinet/);
});
