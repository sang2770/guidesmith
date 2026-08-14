import path from 'node:path';
import fs from 'node:fs';
import { chromium, firefox, webkit, devices } from 'playwright';
import { runAction, resolveTarget, describeTarget } from './actions.mjs';
import { withAnnotations } from './annotate.mjs';
import { ensureDir, writeJson, fileHash, relPosix } from '../util/fs.mjs';
import { log, pc } from '../util/log.mjs';

const ENGINES = { chromium, firefox, webkit };

function slug(s, fallback) {
  const out = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return out || fallback;
}

function shouldShoot(step) {
  if (step.screenshot === false) return false;
  if (step.screenshot === true || typeof step.screenshot === 'string') return true;
  // Default: capture anything that changes what the user sees.
  return step.action !== 'eval' && step.action !== 'wait';
}

/**
 * Run one flow end to end and write screenshots + a capture manifest.
 * @returns {Promise<object>} the manifest
 */
export async function captureFlow(flow, { config, outDir, updateOnly = false }) {
  const engineName = flow.browser || config.browser || 'chromium';
  const engine = ENGINES[engineName];
  if (!engine) throw new Error(`Unknown browser "${engineName}". Use chromium, firefox or webkit.`);

  const baseUrl = flow.baseUrl || config.baseUrl;
  const deviceName = flow.device || config.device;
  const device = deviceName ? devices[deviceName] : null;
  if (deviceName && !device) throw new Error(`Unknown Playwright device "${deviceName}"`);

  const contextOptions = {
    viewport: flow.viewport || config.viewport,
    deviceScaleFactor: flow.deviceScaleFactor ?? config.deviceScaleFactor,
    locale: flow.locale || config.locale,
    colorScheme: flow.colorScheme || config.colorScheme,
    ...(device || {}),
  };
  const storageState = flow.storageState || config.storageState;
  if (storageState && fs.existsSync(path.resolve(storageState))) {
    contextOptions.storageState = path.resolve(storageState);
  }

  const flowDir = ensureDir(path.join(outDir, flow.id));
  const timeout = flow.timeout ?? config.timeout;
  const startedAt = Date.now();

  const browser = await engine.launch({
    headless: flow.headless ?? config.headless,
    args: engineName === 'chromium' ? ['--force-color-profile=srgb', '--hide-scrollbars'] : [],
  });
  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(timeout);
  const page = await context.newPage();

  const manifest = {
    flowId: flow.id,
    title: flow.title,
    description: flow.description || '',
    audience: flow.audience || null,
    prerequisites: flow.prerequisites || [],
    sidebarPosition: flow.sidebarPosition ?? null,
    tags: flow.tags || [],
    baseUrl,
    browser: engineName,
    device: deviceName || null,
    viewport: contextOptions.viewport,
    capturedAt: new Date().toISOString(),
    status: 'ok',
    steps: [],
  };

  const ctx = { baseUrl, timeout, settle: flow.settle ?? config.settle ?? 250 };
  const globalRedact = [...(config.redact || []), ...(flow.redact || [])];
  let shotIndex = 0;

  try {
    for (const [i, step] of flow.steps.entries()) {
      const label = step.name || step.title || `${step.action || 'screenshot'} ${describeTarget(step) || ''}`.trim();
      const t0 = Date.now();
      log.info(`${pc.dim(String(i + 1).padStart(2, '0'))} ${label}`);

      let meta;
      try {
        meta = await runAction(page, step, ctx);
      } catch (err) {
        manifest.status = 'failed';
        manifest.error = { step: i + 1, name: label, message: err.message };
        const failShot = path.join(flowDir, `failure-step-${String(i + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: failShot, fullPage: true }).catch(() => {});
        throw new Error(`Step ${i + 1} (${label}) failed: ${err.message}\n  Screenshot: ${failShot}`);
      }

      const record = {
        index: i + 1,
        name: label,
        note: step.note || step.description || '',
        result: step.result || '',
        callout: step.callout || null,
        optional: !!step.optional,
        ...meta,
        pageUrl: page.url(),
        pageTitle: await page.title().catch(() => ''),
        durationMs: Date.now() - t0,
      };

      if (shouldShoot(step)) {
        shotIndex += 1;
        const name = `${String(shotIndex).padStart(2, '0')}-${slug(label, 'step')}.png`;
        const file = path.join(flowDir, name);

        const highlightSpec = step.highlight ?? (step.action && step.action !== 'goto' ? 'self' : null);
        const locators = [];
        if (highlightSpec === 'self') {
          const loc = resolveTarget(page, step);
          if (loc) locators.push(loc);
        } else if (typeof highlightSpec === 'string') {
          locators.push(page.locator(highlightSpec));
        } else if (Array.isArray(highlightSpec)) {
          for (const sel of highlightSpec) locators.push(page.locator(sel));
        }

        const annotate = { ...(config.annotate || {}), ...(flow.annotate || {}), ...(step.annotate || {}) };
        const useHighlight = step.highlight === false ? false : annotate.highlight !== false;

        await withAnnotations(
          page,
          {
            locators: useHighlight ? locators : [],
            redact: [...globalRedact, ...(step.redactExtra || [])],
            options: {
              ...annotate,
              badgeText: annotate.badge === false ? '' : String(shotIndex),
              badge: annotate.badge !== false,
              caption: step.caption || '',
            },
          },
          async ({ annotatedRects }) => {
            const clip = step.clip ? await page.locator(step.clip).first().boundingBox() : null;
            await page.screenshot({
              path: file,
              fullPage: step.fullPage ?? flow.fullPage ?? config.fullPage,
              ...(clip ? { clip, fullPage: false } : {}),
              animations: 'disabled',
              caret: 'hide',
            });
            record.annotatedRects = annotatedRects;
          },
        );

        record.screenshot = relPosix(outDir, file);
        record.screenshotFile = name;
        record.hash = fileHash(file);
      }

      manifest.steps.push(record);
    }
  } finally {
    manifest.durationMs = Date.now() - startedAt;
    if (flow.saveStorageState) {
      const dest = path.resolve(flow.saveStorageState);
      ensureDir(path.dirname(dest));
      await context.storageState({ path: dest }).catch(() => {});
    }
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (!updateOnly || manifest.steps.length) {
      writeJson(path.join(flowDir, 'capture.json'), manifest);
    }
  }

  return manifest;
}
