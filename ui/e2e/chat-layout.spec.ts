import { expect, test, type Page } from '@playwright/test';
import { healthUp, json, setTheme, snapshot } from './fixtures';

const LONG = (n: number) =>
  `Answer ${n}: unworn items with tags can be returned within 7 days of delivery from My Orders. ` +
  'Refunds go back to the original payment method within 5-7 business days after the quality check. '.repeat(3);

function sse(n: number): string {
  const final = {
    intent: 'returns', answer: LONG(n), policy_ref: 'UT-RET-001', escalate_to_human: false,
    confidence: 0.8, confidence_source: 'model_reported', model_id: 'meta-llama/Llama-3.2-3B-Instruct',
    latency_ms: 900, model_kind: 'base', request_id: `r${n}`, cached: false, repaired: false,
    fallback: false, json_valid_first_try: true, guardrail_triggers: [], model_escalate: false,
    error: null, notice: 'aligned_offline', total_tokens: 500, inference_id: null,
  };
  const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return ev('meta', { request_id: `r${n}`, model_id: final.model_id, model_kind: 'base', notice: 'aligned_offline' }) +
    ev('answer_delta', { text: final.answer }) + ev('final', final);
}

async function backend(page: Page) {
  await healthUp(page);
  await snapshot(page, { generated_at: null, responses: {} });
  let n = 0;
  await page.route('**/v1/**', async (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/v1/demo/status') return json(r, { demo_mode: false });
    if (path === '/v1/models')
      return json(r, { aligned_model_id: null, base_model_id: 'meta-llama/Llama-3.2-3B-Instruct', offline_aligned_model_id: 'm' });
    if (path === '/v1/support/stream')
      return r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse(++n) });
    return json(r, {});
  });
}

async function lastCardClearsComposer(page: Page, n: number) {
  const answer = page.getByText(`Answer ${n}:`, { exact: false }).last();
  await expect(answer).toBeVisible();
  const card = answer.locator('xpath=ancestor::article[1] | ancestor::section[1]').last();
  const composer = page.getByPlaceholder('Type a customer message…');
  await expect(page.getByTestId('base-note').last()).toBeVisible();
  await page.waitForTimeout(900); // let the post-completion scroll settle
  const footer = page.getByText(`r${n}`.slice(0, 8)).last(); // request id chip in the card footer
  const cardBox = (await footer.boundingBox()) ?? (await card.boundingBox());
  const composerForm = composer.locator('xpath=ancestor::form[1]');
  const formBox = await composerForm.boundingBox();
  expect(cardBox && formBox).toBeTruthy();
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(formBox!.y + 1);
}

for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`last reply is never hidden behind the composer (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ reducedMotion: 'reduce' }); // deterministic layout (no exit animations)
    await setTheme(page, 'light');
    await backend(page);
    await page.goto('/chat');
    const box = page.getByPlaceholder('Type a customer message…');
    for (const n of [1, 2, 3]) {
      await box.fill(`question ${n}`);
      await box.press('Enter');
      await lastCardClearsComposer(page, n);
    }
    // confidence is labelled as the model's own number, not a calibrated score
    await expect(page.getByTestId('confidence-model-reported').last()).toHaveText(/model-reported/);
  });
}
