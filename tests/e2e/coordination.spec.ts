import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { applyCommand, connectionsFor, CoordinationError } from '../../src/coordination/ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from '../../src/coordination/seed';
import type { CoordinationCommand, CoordinationSnapshot, CoordinationState } from '../../src/coordination/types';

const SURFACES = [
  { path: '/agents', heading: 'Agent & apparatus stable', screenshot: 'coordination-stable.png' },
  { path: '/board', heading: 'Message board', screenshot: 'coordination-board.png' },
];

function localSnapshot(state: CoordinationState): CoordinationSnapshot {
  return {
    ...state, fixture_only: true, scope: DEMO_SCOPE, mode: 'LOCAL_SANDBOX',
    persistence: 'LOCAL_FILE', canWrite: true, connections: connectionsFor(state, DEMO_SCOPE),
    releaseContexts: structuredClone(RELEASE_CONTEXTS),
  };
}

/** Exercise browser commands against the real ledger without writing the developer's local log. */
async function isolatedBoard(page: Page) {
  let state = createSeed();
  const commands: CoordinationCommand[] = [];
  await page.route('**/api/coordination', async (route) => {
    try {
      if (route.request().method() === 'POST') {
        const command = route.request().postDataJSON() as CoordinationCommand;
        state = applyCommand(state, DEMO_SCOPE, command, RELEASE_CONTEXTS, '2026-09-05T13:00:00.000Z');
        commands.push(command);
      } else if (route.request().method() !== 'GET') {
        await route.fulfill({ status: 405, json: { error: 'METHOD_NOT_ALLOWED' } });
        return;
      }
      await route.fulfill({ status: 200, json: localSnapshot(state) });
    } catch (error) {
      await route.fulfill({
        status: error instanceof CoordinationError ? error.status : 500,
        json: { error: error instanceof CoordinationError ? error.code : 'TEST_LEDGER_ERROR', detail: String(error) },
      });
    }
  });
  return { commands, state: () => state };
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const surface of SURFACES) {
  test(`coordination: ${surface.path} renders read only without page errors`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(surface.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: surface.heading })).toBeVisible();
    await expect(page.getByText('READ ONLY', { exact: true })).toBeVisible();
    await expect(page.getByText('No agents are launched by this board.')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Compose message' })).toHaveCount(0);
    await expect(page.getByRole('form', { name: 'Register participant' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(surface.screenshot), fullPage: true });
  });
}

test('coordination: stable search, kind filters and synastry disclose declared relationships', async ({ page }, testInfo) => {
  await page.goto('/agents');
  const normalization = page.getByRole('article', { name: 'Participant Normalization agent', exact: true });
  await expect(normalization.getByText('PLANNED', { exact: true })).toBeVisible();
  await normalization.locator('summary').click();
  await expect(normalization.getByText(/Contract compatibility indicates how definitions can work together/)).toBeVisible();
  await expect(normalization.getByText('MATCH', { exact: true }).first()).toBeVisible();
  await expect(normalization.getByText('PARTIAL', { exact: true })).toBeVisible();
  await expect(normalization.getByText(/Missing inputs:/)).toContainText('IdentityMapping/v1');
  await page.screenshot({ path: testInfo.outputPath('coordination-synastry.png'), fullPage: true });

  await page.getByRole('combobox', { name: 'Participant kind', exact: true }).selectOption('AGENT');
  await page.getByLabel('Search the stable', { exact: true }).fill('identity.propose');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Participant Identity agent', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Participant kind', exact: true }).selectOption('APPARATUS');
  await expect(page.getByText('No definitions match these filters.')).toBeVisible();
});

test('coordination: the fixture API exposes the shared register with writes explicitly disabled', async ({ request }) => {
  const response = await request.get('/api/coordination');
  expect(response.status()).toBe(200);
  expect(response.headers()['x-payload-fixture-only']).toBe('true');
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json() as CoordinationSnapshot;
  expect(body).toMatchObject({ fixture_only: true, canWrite: false, mode: 'FIXTURE', persistence: 'NONE', scope: DEMO_SCOPE });
  expect(body.participants).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'apparatus.coordination', kind: 'APPARATUS', authority: 'coordination' }),
    expect.objectContaining({ id: 'agent.identity', kind: 'AGENT', status: 'PLANNED' }),
  ]));
  expect(body.participants.every((participant) => participant.scope === DEMO_SCOPE)).toBe(true);
  expect(body.messages.every((message) => message.scope === DEMO_SCOPE)).toBe(true);
  expect(body.releaseContexts).toEqual(RELEASE_CONTEXTS);
});

test('coordination: both surfaces have no serious or critical accessibility violations', async ({ page }) => {
  for (const surface of SURFACES) {
    await page.goto(surface.path);
    if (surface.path === '/agents') {
      await page.getByRole('article', { name: 'Participant Normalization agent', exact: true }).locator('summary').click();
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious, `${surface.path}: ${JSON.stringify(serious.map((violation) => ({ id: violation.id, nodes: violation.nodes.length, help: violation.help })), null, 1)}`).toEqual([]);
  }
});

test('coordination: mobile surfaces and expanded relationships stay within the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  for (const surface of SURFACES) {
    await page.goto(surface.path);
    await expect(page.getByRole('heading', { level: 1, name: surface.heading })).toBeVisible();
    if (surface.path === '/agents') {
      await page.getByRole('article', { name: 'Participant Normalization agent', exact: true }).locator('summary').click();
    }
    await expectNoHorizontalOverflow(page);
  }
});

test('coordination: isolated local board composes a handoff, records its recipient receipt and preserves reply context', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const api = await isolatedBoard(page);
  await page.goto('/board');
  await expect(page.getByRole('form', { name: 'Compose message' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('LOCAL SANDBOX', { exact: true })).toBeVisible();
  const composer = page.getByRole('form', { name: 'Compose message' });
  await expect(composer).toBeVisible();
  if (isMobile) await expectNoHorizontalOverflow(page);

  const context = RELEASE_CONTEXTS.find((release) => release.releaseId === 'REL-CAR-2026.09.01')!;
  const title = 'Review the Caravan identity mapping';
  await composer.getByRole('combobox', { name: 'Author', exact: true }).selectOption('apparatus.corpus');
  await composer.getByRole('combobox', { name: 'Recipient', exact: true }).selectOption('agent.identity');
  await composer.getByRole('combobox', { name: 'Message kind', exact: true }).selectOption('HANDOFF');
  await composer.getByLabel('Topic', { exact: true }).fill('identity-review');
  await composer.getByLabel('Title', { exact: true }).fill(title);
  await composer.getByRole('combobox', { name: 'Release context', exact: true }).selectOption(context.releaseId);
  await composer.getByLabel('Body', { exact: true }).fill('Inspect the sample-to-lot mapping against this release and retain unresolved evidence.');
  await composer.getByRole('button', { name: 'Post message', exact: true }).click();

  const handoff = page.getByRole('article', { name: `Message ${title}`, exact: true });
  await expect(handoff).toBeVisible();
  await expect(handoff.getByText('HANDOFF', { exact: true })).toBeVisible();
  await expect(handoff.getByRole('link', { name: context.releaseId, exact: true })).toBeVisible();
  expect(api.commands[0]).toMatchObject({
    operation: 'post', message: { authorId: 'apparatus.corpus', recipientId: 'agent.identity', kind: 'HANDOFF', topic: 'identity-review', context },
  });
  const posted = api.state().messages.find((message) => message.title === title)!;
  const acknowledger = handoff.getByRole('combobox', { name: `Acknowledge ${title} as`, exact: true });
  await expect(acknowledger.locator('option')).toHaveCount(1);
  await expect(acknowledger).toHaveValue('agent.identity');
  await handoff.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect(handoff.getByText('Acknowledgement receipts:', { exact: true })).toBeVisible();
  await expect(handoff.getByRole('list')).toContainText('Identity agent');
  expect(api.commands[1]).toEqual({ operation: 'acknowledge', messageId: posted.id, participantId: 'agent.identity' });

  await composer.getByRole('combobox', { name: 'Author', exact: true }).selectOption('agent.identity');
  await handoff.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(composer.getByLabel('Topic', { exact: true })).toBeDisabled();
  await expect(composer.getByLabel('Topic', { exact: true })).toHaveValue('identity-review');
  await expect(composer.getByRole('combobox', { name: 'Release context', exact: true })).toBeDisabled();
  await expect(composer.getByRole('combobox', { name: 'Release context', exact: true })).toHaveValue(context.releaseId);
  await expect(composer.getByRole('combobox', { name: 'Recipient', exact: true })).toHaveValue('apparatus.corpus');
  await composer.getByRole('combobox', { name: 'Message kind', exact: true }).selectOption('RESULT');
  await composer.getByLabel('Body', { exact: true }).fill('The evidence does not yet establish identity. Keep the mapping unresolved.');
  await composer.getByRole('button', { name: 'Post message', exact: true }).click();
  const reply = page.getByRole('article', { name: `Message Re: ${title}`, exact: true });
  await expect(reply).toBeVisible();
  await expect(reply.getByRole('link', { name: `Reply to ${posted.id}`, exact: true })).toHaveAttribute('href', `#message-${posted.id}`);
  expect(api.commands[2]).toMatchObject({
    operation: 'post', message: { authorId: 'agent.identity', recipientId: 'apparatus.corpus', kind: 'RESULT', replyTo: posted.id, topic: 'identity-review', context },
  });
  if (isMobile) await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('coordination-local-handoff.png'), fullPage: true });
});
