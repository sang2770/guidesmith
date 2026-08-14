/**
 * Screenshot annotation: highlight the element a step acts on, number it,
 * optionally dim everything else, and blur anything sensitive.
 *
 * Overlays are injected into the DOM in *document* coordinates so they line up
 * for both viewport and full-page screenshots, then torn down afterwards.
 */

const OVERLAY_ID = '__guidesmith_overlay__';

const INSTALL = ({ id }) => {
  const prev = document.getElementById(id);
  if (prev) prev.remove();
  const root = document.createElement('div');
  root.id = id;
  root.setAttribute('data-guidesmith', 'overlay');
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483646',
  });
  document.body.appendChild(root);
};

const DRAW = ({ id, rects, opts }) => {
  const root = document.getElementById(id);
  if (!root) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  if (opts.dimBackdrop && rects.length) {
    const dim = document.createElement('div');
    Object.assign(dim.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${document.documentElement.scrollWidth}px`,
      height: `${document.documentElement.scrollHeight}px`,
      background: 'rgba(15,23,42,0.45)',
      pointerEvents: 'none',
    });
    root.appendChild(dim);
    for (const r of rects) {
      const hole = document.createElement('div');
      Object.assign(hole.style, {
        position: 'absolute',
        left: `${r.x + scrollX - 4}px`,
        top: `${r.y + scrollY - 4}px`,
        width: `${r.width + 8}px`,
        height: `${r.height + 8}px`,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0)',
        background: 'transparent',
        backdropFilter: 'none',
        border: 'none',
        borderRadius: `${opts.radius}px`,
        outline: 'none',
        mixBlendMode: 'destination-out',
      });
      // Cheaper, more portable than destination-out: punch a hole with a clear div.
      hole.style.mixBlendMode = 'normal';
      hole.style.background = 'rgba(255,255,255,0.001)';
      hole.style.boxShadow = 'none';
      root.appendChild(hole);
    }
  }

  rects.forEach((r, i) => {
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'absolute',
      left: `${r.x + scrollX - opts.pad}px`,
      top: `${r.y + scrollY - opts.pad}px`,
      width: `${r.width + opts.pad * 2}px`,
      height: `${r.height + opts.pad * 2}px`,
      border: `${opts.width}px solid ${opts.color}`,
      borderRadius: `${opts.radius}px`,
      boxShadow: `0 0 0 2px rgba(255,255,255,0.85), 0 4px 14px rgba(0,0,0,0.25)`,
      pointerEvents: 'none',
      boxSizing: 'border-box',
    });
    root.appendChild(box);

    if (opts.badge && i === 0) {
      const badge = document.createElement('div');
      badge.textContent = String(opts.badgeText);
      Object.assign(badge.style, {
        position: 'absolute',
        left: `${r.x + scrollX - opts.pad - 14}px`,
        top: `${r.y + scrollY - opts.pad - 14}px`,
        minWidth: '28px',
        height: '28px',
        lineHeight: '28px',
        padding: '0 8px',
        borderRadius: '999px',
        background: opts.badgeColor,
        color: '#fff',
        font: '700 15px/28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      });
      root.appendChild(badge);
    }
  });

  if (opts.caption) {
    const cap = document.createElement('div');
    cap.textContent = opts.caption;
    Object.assign(cap.style, {
      position: 'absolute',
      left: `${scrollX + 16}px`,
      top: `${scrollY + 16}px`,
      maxWidth: '60%',
      padding: '8px 14px',
      borderRadius: '8px',
      background: 'rgba(17,24,39,0.92)',
      color: '#fff',
      font: '600 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
      pointerEvents: 'none',
    });
    root.appendChild(cap);
  }
};

const REDACT = ({ selectors, mode }) => {
  const touched = [];
  for (const sel of selectors) {
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(sel));
    } catch {
      continue;
    }
    for (const el of nodes) {
      touched.push([el, el.getAttribute('style') || '']);
      if (mode === 'block') {
        el.style.setProperty('background', '#111827', 'important');
        el.style.setProperty('color', 'transparent', 'important');
      } else {
        el.style.setProperty('filter', 'blur(8px)', 'important');
      }
      el.setAttribute('data-guidesmith-redacted', '1');
    }
  }
  return touched.length;
};

const UNREDACT = () => {
  for (const el of document.querySelectorAll('[data-guidesmith-redacted]')) {
    el.style.removeProperty('filter');
    el.style.removeProperty('background');
    el.style.removeProperty('color');
    el.removeAttribute('data-guidesmith-redacted');
  }
};

const TEARDOWN = ({ id }) => {
  document.getElementById(id)?.remove();
};

/** Bounding boxes, in viewport coords, for every element matching a target. */
async function rectsFor(locator, max = 6) {
  const count = await locator.count().catch(() => 0);
  const rects = [];
  for (let i = 0; i < Math.min(count, max); i++) {
    const box = await locator.nth(i).boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0) rects.push(box);
  }
  return rects;
}

export async function withAnnotations(page, { locators = [], redact = [], options = {} }, fn) {
  const opts = {
    color: options.highlightColor || '#ff3b30',
    width: options.highlightWidth ?? 3,
    radius: options.radius ?? 6,
    pad: options.pad ?? 4,
    badge: options.badge ?? true,
    badgeText: options.badgeText ?? '',
    badgeColor: options.badgeColor || options.highlightColor || '#ff3b30',
    dimBackdrop: options.dimBackdrop ?? false,
    caption: options.caption || '',
  };

  let redacted = 0;
  try {
    if (redact.length) redacted = await page.evaluate(REDACT, { selectors: redact, mode: options.redactMode || 'blur' });
    const rects = [];
    for (const loc of locators) rects.push(...(await rectsFor(loc)));
    if (rects.length || opts.caption) {
      await page.evaluate(INSTALL, { id: OVERLAY_ID });
      await page.evaluate(DRAW, { id: OVERLAY_ID, rects, opts });
    }
    return await fn({ annotatedRects: rects.length, redacted });
  } finally {
    await page.evaluate(TEARDOWN, { id: OVERLAY_ID }).catch(() => {});
    if (redacted) await page.evaluate(UNREDACT).catch(() => {});
  }
}
