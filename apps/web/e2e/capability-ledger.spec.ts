import { expect, test } from '@playwright/test';
import { demoMissionId, loginAsDemoOwner } from './helpers';

test('uploaded company evidence appears in the capability ledger', async ({ page }) => {
  await loginAsDemoOwner(page);
  await page.goto(`/missions/${demoMissionId}/capability-ledger`);
  await expect(page.getByText(/EN 10204 material traceability/)).toBeVisible();
  await expect(page.getByText(/Observed|Fact/i)).toBeVisible();
});
