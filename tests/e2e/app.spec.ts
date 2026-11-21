import { expect, test, type Page } from '@playwright/test';

async function loginAsE2eAdmin(page: Page) {
  await page.goto('/');
  await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
  await page.locator('input[autocomplete="username"]').fill('e2e_admin');
  await page.locator('input[type="password"]').first().fill('E2eTestPass!123');
  await page.getByRole('button', { name: 'Oturum Aç' }).click();
  await expect(page.locator('header h3', { hasText: 'genel' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Çakma v0.9.0 End-to-End', () => {
  test('auth screen, theme toggle, header dropdown stacking regression & live messaging', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/');

    const usernameInput = page.locator('input[autocomplete="username"]');
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Theme toggle works cleanly on Auth screen
    const themeToggleBtn = page.locator('button[aria-label*="Temaya Geç"]');
    await expect(themeToggleBtn).toBeVisible();
    await themeToggleBtn.click();
    await themeToggleBtn.click();

    // Sign in with seeded admin account
    await usernameInput.fill('e2e_admin');
    await passwordInput.fill('E2eTestPass!123');
    await page.getByRole('button', { name: 'Oturum Aç' }).click();

    await expect(page.locator('header h3', { hasText: 'genel' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('📌 Sabit Duyuru')).toBeVisible();

    // Regression Check #1: Notification Bell dropdown renders ABOVE the Sticky Notice bar
    await page.locator('button[aria-label="Kanal Bildirim Tercihi"]').click();
    const notifHeading = page.getByText('Bildirim Tercihi', { exact: true });
    await expect(notifHeading).toBeVisible();
    const notifBox = await notifHeading.boundingBox();
    expect(notifBox).not.toBeNull();
    if (notifBox) {
      const hitResult = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return {
            text: el?.textContent?.trim() || '',
            insideZ50: Boolean(el?.closest('.z-50')),
          };
        },
        [notifBox.x + notifBox.width / 2, notifBox.y + notifBox.height / 2]
      );
      expect(hitResult.insideZ50).toBe(true);
      expect(hitResult.text).not.toContain('Sabit Duyuru');
    }

    // Regression Check #2: Channel Tools dropdown renders ABOVE the Sticky Notice bar
    await page.locator('button[aria-label="Kanal Araçları"]').click();
    const galleryBtn = page.getByText('Medya & Dosya Galerisi', { exact: true });
    await expect(galleryBtn).toBeVisible();
    const toolsHeading = page.locator('div.z-50', { hasText: 'Medya & Dosya Galerisi' }).first();
    const toolsBox = await toolsHeading.boundingBox();
    expect(toolsBox).not.toBeNull();
    if (toolsBox) {
      // Sample top region of dropdown (where it overlaps the sticky notice band right below the header)
      const hitResult = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return {
            text: el?.textContent?.trim() || '',
            insideZ50: Boolean(el?.closest('.z-50')),
          };
        },
        [toolsBox.x + toolsBox.width / 2, toolsBox.y + 18]
      );
      expect(hitResult.insideZ50).toBe(true);
      expect(hitResult.text).not.toContain('Sabit Duyuru');
    }

    await page.keyboard.press('Escape');
    await expect(galleryBtn).not.toBeVisible();

    // Live chat messaging
    const composer = page.locator('textarea[aria-label="Mesaj yaz"]');
    await expect(composer).toBeVisible();
    await composer.fill('Merhaba E2E v0.9.0 testi!');
    await composer.press('Enter');

    await expect(page.getByText('Merhaba E2E v0.9.0 testi!')).toBeVisible({ timeout: 10_000 });
    expect(pageErrors).toEqual([]);
  });

  test('forum channel topic creation, 4-type CreateChannelModal & DSP/Global Shortcut settings', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await loginAsE2eAdmin(page);

    // Switch to Forum channel
    await page.getByRole('button', { name: 'forum-alani' }).click();
    const newTopicBtn = page.getByRole('button', { name: 'Yeni Konu Başlat', exact: true });
    await expect(newTopicBtn).toBeVisible();

    // Create a forum post
    await newTopicBtn.click();
    await page.locator('input[placeholder="Konu başlığı..."]').fill('E2E Forum Başlığı');
    await page.locator('input[placeholder="Etiketler (virgülle ayır)..."]').fill('test, v090');
    await page.locator('textarea[placeholder*="Konu açıklamanızı"]').fill('Forum konu içeriği burada.');
    await page.getByRole('button', { name: 'Konuyu Yayınla' }).click();

    await expect(page.getByRole('heading', { name: 'E2E Forum Başlığı' })).toBeVisible({ timeout: 10_000 });

    // Open CreateChannelModal from category "+" button and verify all 4 types + category select
    await page.locator('button[title="Bu Kategoriye Kanal Ekle"]').first().click();
    await expect(page.getByRole('button', { name: /Metin Kanalı/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Duyuru Kanalı/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Forum Kanalı/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ses & Ekran Odası/ })).toBeVisible();
    await expect(page.locator('select option', { hasText: 'Genel Kanallar' })).toBeAttached();
    await page.getByRole('button', { name: 'Vazgeç' }).click();

    // Open Settings Modal and inspect DSP Voice Gate & Configurable Global Shortcuts
    await page.locator('button[aria-label="Ayarlar"]').click();
    await page.getByRole('button', { name: 'Gürültü & Filtreler' }).click();
    await expect(page.getByText('Konuşma Geçit Eşiği (Voice Gate)')).toBeVisible();

    await page.getByRole('button', { name: 'Kısayol Tuşları' }).click();
    await expect(page.getByText('Masaüstü Global Kısayolları')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ctrl+Shift+M' })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
