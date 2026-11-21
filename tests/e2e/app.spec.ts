import { expect, test, type Page } from '@playwright/test';

async function loginAsE2eAdmin(page: Page) {
  await page.goto('/');
  await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
  await page.locator('input[autocomplete="username"]').fill('e2e_admin');
  await page.locator('input[type="password"]').first().fill('E2eTestPass!123');
  await page.getByRole('button', { name: 'Oturum Aç' }).click();
  await expect(page.locator('header h3', { hasText: 'genel' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Çakma v1.0.0 End-to-End', () => {
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

  test('v1.0.0 stage channel, channel permissions, governance tabs, passkey/PTT/DND settings, smart search & command palette', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/');
    await expect(page.locator('input[autocomplete="username"]')).toBeVisible();

    const hasWebAuthn = await page.evaluate(() =>
      Boolean(typeof window.PublicKeyCredential !== 'undefined' && navigator?.credentials?.create)
    );
    if (hasWebAuthn) {
      await expect(page.locator('[data-testid="passkey-login-btn"]')).toBeVisible();
    }

    await loginAsE2eAdmin(page);

    // 1. Create a Stage channel and verify Stage UI
    await page.locator('button[title="Bu Kategoriye Kanal Ekle"]').first().click();
    const stageTypeBtn = page.getByRole('button', { name: /Sahne Kanalı/ });
    await expect(stageTypeBtn).toBeVisible();
    await stageTypeBtn.click();
    await page.locator('input[placeholder="yeni-kanal"]').fill('sahne-test');
    await page.getByRole('button', { name: 'Ekle', exact: true }).click();

    const stageChannelBtn = page.getByRole('button', { name: 'sahne-test', exact: true });
    await expect(stageChannelBtn).toBeVisible({ timeout: 10_000 });
    await stageChannelBtn.click();
    await expect(page.getByText(/Konuşmacılar/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Dinleyiciler/)).toBeVisible();

    // 2. Switch back to #genel and open Channel Permissions modal via right-click
    const genelBtn = page.getByRole('button', { name: 'genel', exact: true });
    await genelBtn.click();
    await expect(page.locator('header h3', { hasText: 'genel' })).toBeVisible();
    await genelBtn.click({ button: 'right' });
    await page.locator('button', { hasText: 'Kanal İzinleri' }).click();
    await expect(page.getByText('Gizli / Özel Kanal')).toBeVisible();
    await page.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.getByText('Gizli / Özel Kanal')).not.toBeVisible();

    // 3. Server Settings governance tabs
    await page.locator('aside header').first().click();
    await page.getByRole('button', { name: /Sunucu Ayarları/ }).click();

    await page.getByRole('button', { name: /Sunucu Karşılama & Onboarding/ }).click();
    await expect(page.getByText('Onboarding Ekranını Etkinleştir')).toBeVisible();

    await page.getByRole('button', { name: /Zamanlanmış Mesajlar/ }).click();
    await expect(page.getByText('Gönderim Tarihi')).toBeVisible();

    await page.getByRole('button', { name: /Otomasyon Kuralları/ }).click();
    await expect(page.getByPlaceholder(/Kural adı/)).toBeVisible();

    await page.getByRole('button', { name: /Sunucu Denetim Günlüğü/ }).click();
    await expect(page.getByPlaceholder('Aktör, hedef veya detay ara...')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Aktör, hedef veya detay ara...')).not.toBeVisible();

    // 4. User Settings: Passkey card, Mouse4/5 PTT presets, Auto Game DND
    await page.locator('button[aria-label="Ayarlar"]').click();

    await page.getByRole('button', { name: 'Gizlilik & Güvenlik' }).click();
    await expect(page.getByText('Passkey (Şifresiz Biyometrik Giriş)')).toBeVisible();

    await page.getByRole('button', { name: 'Kısayol Tuşları' }).click();
    await expect(page.getByRole('button', { name: 'Mouse4', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mouse5', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Oyun İçi Overlay' }).click();
    await expect(page.getByText('Oyun Açılınca Otomatik Rahatsız Etme Modu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText('Oyun Açılınca Otomatik Rahatsız Etme Modu')).not.toBeVisible();

    // 5. Supercharged Ctrl+K Command Palette
    await page.keyboard.press('Control+k');
    const switcherInput = page.locator('input[placeholder*="Nereye gitmek istersin"]');
    await expect(switcherInput).toBeVisible();
    await switcherInput.fill('Dışa Aktar');
    await expect(page.getByText('Sohbeti Dışa Aktar (.md)')).toBeVisible();
    await switcherInput.fill('sahne-test');
    await expect(page.getByText(/Sahne \/ Tribün/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(switcherInput).not.toBeVisible();

    // 6. Channel Tools export options & Smart Search filter chips
    await page.locator('button[aria-label="Kanal Araçları"]').click();
    await expect(page.getByText('Sohbeti Dışa Aktar (.md)')).toBeVisible();
    await expect(page.getByText('Sohbeti Dışa Aktar (.json)')).toBeVisible();
    await page.keyboard.press('Escape');

    const quickFilter = page.locator('input[aria-label="Kanal mesajlarında hızlı filtrele"]');
    await quickFilter.click();
    await expect(page.getByRole('button', { name: 'has:image' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'is:pinned' })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
