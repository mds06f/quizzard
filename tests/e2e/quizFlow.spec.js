const { test, expect } = require('@playwright/test');

test.describe('Quiz Single Player Flow', () => {
  test('should complete a quiz and show results', async ({ page }) => {
    // 1. Load welcome page
    await page.goto('/');
    await expect(page).toHaveTitle(/Quizzard/);

    // 2. Fill in username
    await page.fill('#user-name', 'E2E Test Player');

    // 3. Select a topic/section if not already selected
    const select = page.locator('#section-select');
    await select.waitFor({ state: 'visible' });
    
    // Select first option value (usually 1 or first available database section ID)
    const options = await select.locator('option').all();
    if (options.length > 1) {
      // Index 0 is often the disabled placeholder "Select topic", so choose index 1
      const val = await options[1].getAttribute('value');
      if (val) {
        await select.selectOption(val);
      }
    }

    // 4. Start single player quiz
    const startBtn = page.locator('#btn-start-quiz');
    await startBtn.click();

    // 5. Verify redirect to /quiz
    await page.waitForURL('**/quiz*');
    await expect(page.locator('#quiz-form')).toBeVisible();

    // 6. Answer questions sequentially
    let hasNext = true;
    while (hasNext) {
      // Wait for option cards to be visible
      const optionCards = page.locator('.option-card');
      await optionCards.first().waitFor({ state: 'visible' });

      // Click first option card
      await optionCards.first().click();

      // Check bottom action button
      const actionBtn = page.locator('#action-btn');
      await expect(actionBtn).not.toBeDisabled();

      const btnText = await actionBtn.textContent();
      if (btnText && btnText.includes('Next Question')) {
        await actionBtn.click();
      } else if (btnText && btnText.includes('Submit Quiz')) {
        await actionBtn.click();
        hasNext = false;
      } else {
        break;
      }
    }

    // 7. Confirm submission on pre-submit modal
    const confirmBtn = page.locator('button[onclick="confirmFinalSubmission()"]');
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();

    // 8. Verify redirect to /result
    await page.waitForURL('**/result*');
    await expect(page.locator('body')).toContainText(/Score:/i || /Results/i || /Perfect/i || /Excellent/i || /Way to go/i || /Good job/i || /Better/i);
  });
});
