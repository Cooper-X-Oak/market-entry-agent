import { expect, test } from '@playwright/test';
import { demoMissionId, loginAsDemoOwner } from './helpers';

test('weekly refresh proposal can be reviewed and accepted', async ({ page }) => {
  await loginAsDemoOwner(page);
  await page.goto(`/missions/${demoMissionId}/refresh-center`);
  await expect(page.getByText('Weekly evidence and opportunity update')).toBeVisible();
  await page.getByRole('button', { name: '接受更新' }).click();
  await expect(page.getByText(/accepted/i)).toBeVisible();
  await page.goto(`/missions/${demoMissionId}/timeline`);
  await expect(page.getByText('First-contact action approved')).toBeVisible();
});
