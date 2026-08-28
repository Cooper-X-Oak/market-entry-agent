import { expect, test } from '@playwright/test';
import { demoMissionId, loginAsDemoOwner } from './helpers';

test('route to target to contact to action to interaction journey', async ({ page }) => {
  await loginAsDemoOwner(page);
  await page.goto(`/missions/${demoMissionId}/market-routes`);
  await expect(page.getByText('Technical distributor route')).toBeVisible();
  await page.goto(`/missions/${demoMissionId}/targets`);
  await expect(page.getByText('RheinWerk Distribution GmbH')).toBeVisible();
  await page.goto(`/missions/${demoMissionId}/contact-paths`);
  await expect(page.getByText('procurement@rheinwerk.example')).toBeVisible();
  await page.goto(`/missions/${demoMissionId}/action-queue`);
  await page.getByRole('link', { name: /Confirm portfolio fit/ }).click();
  await expect(page.getByText('Qualified industrial valve portfolio')).toBeVisible();
});
