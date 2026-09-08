import { expect, type Page } from '@playwright/test';

export const demoMissionId = '10000000-0000-4000-8000-000000000003';

export async function loginAsDemoOwner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('owner@demo.local');
  await page.getByLabel('密码').fill(process.env.DEMO_PASSWORD ?? 'Demo123!');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/workspaces/);
  await page.getByRole('button', { name: /进入工作区/ }).first().click();
  await expect(page).toHaveURL(/dashboard/);
}
