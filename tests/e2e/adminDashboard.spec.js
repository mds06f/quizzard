const { test, expect } = require('@playwright/test');

test.describe('Admin Dashboard Operations', () => {
  test('should login, create a topic, and delete it', async ({ page }) => {
    // 1. Load login page
    await page.goto('/admin/login');
    await expect(page).toHaveTitle(/Admin Login/);

    // 2. Perform login
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');

    // 3. Verify redirect to /admin dashboard
    await page.waitForURL('**/admin');
    await expect(page.locator('h1')).toContainText(/Admin Dashboard/i || /Admin/i);

    // 4. Open "Create New Topic" modal
    const addTopicBtn = page.locator('button[onclick="toggleModal(\'add-section-modal\')"]');
    await addTopicBtn.click();

    // 5. Fill topic details
    const newTopicName = 'Playwright Test Topic';
    await page.fill('#section-name', newTopicName);
    await page.click('#add-section-modal button[type="submit"]');

    // 6. Verify section is listed in dashboard
    await page.waitForURL('**/admin');
    await expect(page.locator('body')).toContainText(newTopicName);

    // 7. Setup alert handler to automatically confirm the deletion dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Are you sure you want to delete');
      await dialog.accept();
    });

    // 8. Delete the newly created topic
    const item = page.locator('.group', { hasText: newTopicName });
    await item.locator('button[title="Delete"]').click();

    // 9. Verify it is removed from the dashboard
    await page.waitForURL('**/admin');
    await expect(page.locator('body')).not.toContainText(newTopicName);
  });
});
