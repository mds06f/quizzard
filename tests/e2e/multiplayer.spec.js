const { test, expect } = require('@playwright/test');

test.describe('Multiplayer 1v1 Competitive Duel', () => {
  test('should connect host and guest to a room, play, and complete a game', async ({ browser }) => {
    // Create Host session
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');

    await hostPage.fill('#user-name', 'Host Player');
    await hostPage.click('#mode-multiplayer');

    // Select first category
    const select = hostPage.locator('#section-select');
    await select.waitFor({ state: 'visible' });
    const options = await select.locator('option').all();
    if (options.length > 1) {
      const val = await options[1].getAttribute('value');
      if (val) await select.selectOption(val);
    }

    // Click "Create Room"
    await hostPage.click('#btn-host-room');

    // Wait for room code display
    const roomCodeVal = hostPage.locator('#room-code-val');
    await roomCodeVal.waitFor({ state: 'visible' });
    const roomCode = (await roomCodeVal.textContent()).trim();
    expect(roomCode).not.toBe('------');

    // Create Guest session
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto('/');

    await guestPage.fill('#user-name', 'Guest Player');
    await guestPage.click('#mode-multiplayer');

    // Fill room code and click Join
    await guestPage.fill('#join-code-input', roomCode);
    await guestPage.click('#btn-join-room');

    // Verify both pages redirect to /quiz
    await Promise.all([
      hostPage.waitForURL('**/quiz*'),
      guestPage.waitForURL('**/quiz*')
    ]);

    // Let's answer 5 questions sequentially
    for (let i = 0; i < 5; i++) {
      // Host: select option
      const hostOptions = hostPage.locator('.option-card');
      await hostOptions.first().waitFor({ state: 'visible' });
      await hostOptions.first().click();

      // Guest: select option
      const guestOptions = guestPage.locator('.option-card');
      await guestOptions.first().waitFor({ state: 'visible' });
      await guestOptions.first().click();

      // Wait a short delay to allow socket timeout loop (4s in server + buffer)
      await hostPage.waitForTimeout(5000);
    }

    // Verify both redirect to /result
    await Promise.all([
      hostPage.waitForURL('**/result*'),
      guestPage.waitForURL('**/result*')
    ]);

    await expect(hostPage.locator('body')).toContainText(/opponent/i || /Result/i || /Perfect/i || /Excellent/i || /Way/i);
    await expect(guestPage.locator('body')).toContainText(/opponent/i || /Result/i || /Perfect/i || /Excellent/i || /Way/i);

    await hostContext.close();
    await guestContext.close();
  });
});
