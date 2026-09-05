import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

// Every test here runs against the real Rust kernel and the real local store in an isolated temporary directory.
test.beforeEach(({ page }) => {
  test.skip(process.env.STATE_KERNEL_E2E !== '1', 'Requires the enabled, isolated local state-kernel server; no browser API mocking.');
  page.on('dialog', (dialog) => void dialog.accept());
});

async function loaded(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Notations', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/Saved local state loaded|Browser drafts restored|Unapplied text restored/);
}

test('notations: real local state survives create, edit, Rust undo and save/page reload', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/notations');
  await loaded(page);
  await expect(page.getByText('LOCAL DEVELOPMENT', { exact: true })).toBeVisible();
  const initialVersion = Number(await page.getByTestId('saved-version').textContent());
  const title = `Local notation ${testInfo.project.name} ${Date.now()}`;
  await page.getByLabel('New notation title', { exact: true }).fill(title);
  await page.getByLabel('New notation body', { exact: true }).fill('Original authored notation, not canonical evidence.');
  await page.getByRole('button', { name: 'Preview new notation', exact: true }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  const notationId = await page.getByTestId('selected-notation-id').textContent();
  expect(notationId).toMatch(/^[a-f0-9-]{36}$/);
  await expect(page.getByTestId('saved-version')).toHaveText(String(initialVersion));
  await page.getByLabel('Notation title', { exact: true }).fill(`${title} revised`);
  await page.getByLabel('Notation body', { exact: true }).fill('Revised authored local context.');
  await expect(page.getByTestId('edit-unapplied')).toBeVisible();
  await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('2');
  await expect(page.getByTestId('selected-notation-id')).toHaveText(notationId!);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Notation title', { exact: true })).toHaveValue(title);
  await expect(page.getByLabel('Notation body', { exact: true })).toHaveValue('Original authored notation, not canonical evidence.');
  await expect(page.getByTestId('pending-count')).toHaveText('3');
  await page.getByRole('button', { name: 'Save local version', exact: true }).click();
  await expect(page.getByText(`Saved local version ${initialVersion + 1}.`, { exact: true })).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  await page.reload();
  await loaded(page);
  await page.getByRole('button', { name: `Select notation ${title}`, exact: true }).click();
  await expect(page.getByTestId('selected-notation-id')).toHaveText(notationId!);
  await expect(page.getByLabel('Notation title', { exact: true })).toHaveValue(title);
  await expect(page.getByLabel('Notation body', { exact: true })).toHaveValue('Original authored notation, not canonical evidence.');
  await expect(page.getByTestId('saved-version')).toHaveText(String(initialVersion + 1));
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('notation-state.png'), fullPage: true });
});

test('notations: drafts survive internal navigation (Stay / Leave and keep / Discard) and a browser reload, with accessible focus', async ({ page }, testInfo) => {
  await page.goto('/notations');
  await loaded(page);
  const title = `Draft kept ${testInfo.project.name} ${Date.now()}`;
  await page.getByLabel('New notation title', { exact: true }).fill(title);
  await expect(page.getByTestId('state-text')).toHaveAttribute('data-count', '1');
  const nav = page.getByRole('navigation', { name: 'Primary' });

  await nav.getByRole('link', { name: 'Releases' }).click();
  const dialog = page.getByTestId('leave-dialog');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/notations$/);
  await expect(page.locator(':focus')).toHaveText('Stay');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Leave and keep drafts');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('New notation title', { exact: true })).toHaveValue(title);

  await nav.getByRole('link', { name: 'Releases' }).click();
  await dialog.getByRole('button', { name: 'Leave and keep drafts' }).click();
  await expect(page).toHaveURL(/\/releases$/);
  await nav.getByRole('link', { name: 'Notations' }).click();
  await expect(page.getByRole('status')).toContainText('Unapplied text restored from this tab.');
  await expect(page.getByLabel('New notation title', { exact: true })).toHaveValue(title);

  await page.reload();
  await loaded(page);
  await expect(page.getByLabel('New notation title', { exact: true })).toHaveValue(title);
  await page.getByRole('button', { name: 'Preview new notation', exact: true }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  const notationId = await page.getByTestId('selected-notation-id').textContent();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Browser drafts restored: 1 pending command re-validated by the state kernel. Not saved.');
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await expect(page.getByTestId('selected-notation-id')).toHaveText(notationId!);

  await nav.getByRole('link', { name: 'Releases' }).click();
  await dialog.getByRole('button', { name: 'Discard drafts and leave' }).click();
  await expect(page).toHaveURL(/\/releases$/);
  await nav.getByRole('link', { name: 'Notations' }).click();
  await loaded(page);
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  await expect(page.getByLabel('New notation title', { exact: true })).toHaveValue('');
});

test('notations: a preview the kernel refuses keeps the draft, and the three states are told apart', async ({ page }) => {
  await page.goto('/notations');
  await loaded(page);
  const tooLong = 'x'.repeat(161);
  await page.getByLabel('New notation title', { exact: true }).fill(tooLong);
  await page.getByRole('button', { name: 'Preview new notation', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText(/[A-Z_]+:/);
  await expect(page.getByLabel('New notation title', { exact: true })).toHaveValue(tooLong);
  await expect(page.getByTestId('state-text')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('state-pending')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('state-saved')).toContainText('Saved local version');
  await expect(page.getByTestId('capacity')).toHaveAttribute('data-source', 'CONTRACT');
  await expect(page.getByTestId('capacity-commands')).toContainText('/ 256');
  await expect(page.getByTestId('capacity-versions')).toContainText('/ 64');
  await expect(page.getByTestId('evidence-fixture-marker')).toBeVisible();
  await expect(page.locator('[data-reference-id]')).toHaveCount(5);
  await expect(page.locator('[data-reference-id][data-resolution="CHANGED"]')).toHaveCount(1);
});

test('notations: a version conflict keeps the work inspectable and copyable, and recovery is deliberate', async ({ page }, testInfo) => {
  await page.goto('/notations');
  await loaded(page);
  const mine = `Mine ${testInfo.project.name} ${Date.now()}`;
  const theirs = `Theirs ${testInfo.project.name} ${Date.now()}`;
  const base = Number(await page.getByTestId('saved-version').textContent());
  await page.getByLabel('New notation title', { exact: true }).fill(mine);
  await page.getByRole('button', { name: 'Preview new notation', exact: true }).click();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  const competing = await page.request.post('/api/state-kernel/save', {
    headers: { 'Content-Type': 'application/json' },
    data: { schema: 'payload.notation-command-batch.v1', baseVersion: base, commands: [{ commandId: randomUUID(), kind: 'CREATE_NOTATION', notation: { id: randomUUID(), title: theirs, body: 'Saved by another writer.' } }] },
  });
  expect(competing.status()).toBe(200);
  await page.getByRole('button', { name: 'Save local version', exact: true }).click();
  const panel = page.getByTestId('conflict-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-reason', 'VERSION_CONFLICT');
  await expect(panel).toContainText(`after version ${base}`);
  await expect(panel.getByTestId('conflict-commands')).toContainText(`Create notation "${mine}"`);
  await expect(panel.getByLabel('Draft JSON')).toHaveValue(new RegExp(mine));
  await panel.getByRole('button', { name: 'Copy drafts as JSON' }).click();
  await expect(panel.getByRole('status')).toContainText(/Copied to the clipboard|Clipboard unavailable/);
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await panel.getByRole('button', { name: 'Keep working with these drafts' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Reload saved state', exact: true }).click();
  await expect(page.locator(':focus')).toHaveText('Keep editing');
  await page.getByRole('button', { name: 'Discard drafts and reload', exact: true }).click();
  await expect(page.getByTestId('saved-version')).toHaveText(String(base + 1));
  await expect(page.getByTestId('pending-count')).toHaveText('0');
  await expect(page.getByRole('button', { name: `Select notation ${theirs}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Select notation ${mine}`, exact: true })).toHaveCount(0);
});
