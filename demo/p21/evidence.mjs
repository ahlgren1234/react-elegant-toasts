// P-21 D1 machine evidence: demo only and disposable, removed with `demo/p21/` in S5.
//
// Drives the `?p21` prototype in a headless Chromium over the DevTools protocol with trusted touch,
// pen and mouse input, and prints a JSON report. Uses only Node's built-in `fetch` and `WebSocket`
// (Node 22+). Start a Chromium with `--remote-debugging-port` and an isolated profile first, and the
// demo server; then run:
//
//   node demo/p21/evidence.mjs [devtools-origin] [page-url]
//
// Headless Chromium evidence only: not a real device, not WebKit or Firefox.
const DEVTOOLS = process.argv[2] ?? 'http://127.0.0.1:9333';
const PAGE = process.argv[3] ?? 'http://localhost:5199/react-elegant-toasts/?p21';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
  const created = await fetch(`${DEVTOOLS}/json/new?about:blank`, { method: 'PUT' }).then(r =>
    r.json()
  );
  const socket = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let next = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
    } else {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      next += 1;
      pending.set(next, { resolve, reject, method });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  const once = method =>
    new Promise(resolve => {
      const list = listeners.get(method) ?? [];
      const listener = params => {
        listeners.set(
          method,
          (listeners.get(method) ?? []).filter(l => l !== listener)
        );
        resolve(params);
      };
      list.push(listener);
      listeners.set(method, list);
    });
  return { send, once, close: () => socket.close(), targetId: created.id };
}

const cdp = await connect();
const { send } = cdp;

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(`${expression}\n${JSON.stringify(exceptionDetails)}`);
  return result.value;
}

async function load({ reducedMotion = false } = {}) {
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
    ],
  });
  const loaded = cdp.once('Page.loadEventFired');
  await send('Page.navigate', { url: PAGE });
  await loaded;
  for (let i = 0; i < 100 && !(await evaluate('!!window.__p21')); i += 1) await sleep(50);
  // A sampler: every frame, the target's rect, matrix and opacity, for continuity checks.
  await evaluate(`window.__sample = (uid, ms) => new Promise(resolve => {
    const out = []; const start = performance.now();
    const step = () => {
      const el = document.querySelector('[data-uid="' + uid + '"]');
      if (el) {
        const m = getComputedStyle(el).transform;
        const n = m === 'none' ? [1,0,0,1,0,0] : m.slice(m.indexOf('(') + 1, -1).split(',').map(Number);
        const r = el.getBoundingClientRect();
        out.push({ t: Math.round(performance.now() - start), left: +r.left.toFixed(2), top: +r.top.toFixed(2),
          mx: n[4], my: n[5], opacity: +getComputedStyle(el).opacity, swiping: el.dataset.swiping || null,
          phase: el.dataset.phase });
      } else out.push({ t: Math.round(performance.now() - start), removed: true });
      if (performance.now() - start < ms && el) requestAnimationFrame(step); else resolve(out);
    };
    requestAnimationFrame(step);
  })`);
  await sleep(400);
}

const state = () =>
  evaluate(
    'window.__p21.state().map(({ rect, ...rest }) => ({ ...rest, top: rect.top, left: rect.left, width: rect.width, height: rect.height }))'
  );
const find = async uid => (await state()).find(t => t.uid === uid);
const logTail = n => evaluate(`window.__p21.log.slice(0, ${n})`);

async function setup(position, patch = {}) {
  await evaluate(`window.__p21.reset(${JSON.stringify(position)})`);
  await evaluate(
    `window.__p21.set(${JSON.stringify({ slow: 1, rm: false, rtl: false, seeding: 'composed', dragPolicy: 'freeze', autoCloseMs: 0, ...patch })})`
  );
  const uids = [];
  for (let i = 0; i < 3; i += 1) {
    uids.push(await evaluate('window.__p21.add()'));
    await sleep(30);
  }
  await sleep(500 * (patch.slow ?? 1));
  return uids;
}

/** A point on a toast's description, away from its controls. */
async function bodyPoint(uid) {
  // The description or custom heading: mirrored layouts move the controls, not the text.
  return evaluate(`(() => {
    const el = document.querySelector('[data-uid="${uid}"] .p21-desc, [data-uid="${uid}"] .p21-custom strong');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + Math.min(40, r.width / 2)), y: Math.round(r.top + r.height / 2) };
  })()`);
}

const touch = (type, points) =>
  send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(({ x, y, id = 0 }) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 })),
  });

/** Moves one touch from `from` by (dx, dy) in `steps`, `stepMs` apart, then optionally lifts. */
async function swipe(from, dx, dy, { steps = 12, stepMs = 16, lift = true, id = 0 } = {}) {
  await touch('touchStart', [{ ...from, id }]);
  for (let i = 1; i <= steps; i += 1) {
    await sleep(stepMs);
    await touch('touchMove', [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps, id }]);
  }
  if (lift) {
    await sleep(stepMs);
    await touch('touchEnd', []);
  }
}

const maxStep = (samples, key) => {
  let max = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1][key];
    const b = samples[i][key];
    if (typeof a === 'number' && typeof b === 'number') max = Math.max(max, Math.abs(b - a));
  }
  return +max.toFixed(2);
};

const report = { chrome: (await send('Browser.getVersion')).product, page: PAGE, results: {} };
const record = (name, value) => {
  report.results[name] = value;
  process.stderr.write(`${name}: ${JSON.stringify(value).slice(0, 300)}\n`);
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 412,
  height: 915,
  deviceScaleFactor: 2.625,
  mobile: true,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await load();

// --- Gesture basics (×1) -----------------------------------------------------------------

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, 60, 0, { lift: false });
  const during = await find(c);
  await touch('touchEnd', []);
  await sleep(20);
  const afterRelease = await find(c);
  await sleep(400);
  const settled = await find(c);
  record('cancel-below-threshold', {
    during: {
      swiping: during.swiping,
      gesture: during.gesture,
      reasons: during.reasons,
      matrix: during.matrix,
      opacity: during.opacity,
      vars: during.vars,
    },
    afterRelease: {
      swiping: afterRelease.swiping,
      reasons: afterRelease.reasons,
      phase: afterRelease.phase,
    },
    settled: {
      swiping: settled.swiping,
      matrix: settled.matrix,
      opacity: settled.opacity,
      phase: settled.phase,
      inlineTransform: settled.inlineTransform,
    },
    log: await logTail(6),
  });
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, 150, 0, { steps: 20, stepMs: 20 });
  await sleep(20);
  const releasing = await find(c);
  await sleep(500);
  record('commit-by-distance', {
    releasing: releasing && {
      phase: releasing.phase,
      exitReason: releasing.exitReason,
      swiping: releasing.swiping,
      reasons: releasing.reasons,
    },
    removed: await evaluate('window.__p21.removed()'),
    log: await logTail(8),
  });
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, 45, 0, { steps: 3, stepMs: 16 });
  await sleep(500);
  record('fast-flick-short-distance', {
    removed: await evaluate('window.__p21.removed()'),
    log: await logTail(5),
  });
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, -150, 0, { lift: false });
  const during = await find(c);
  await touch('touchEnd', []);
  await sleep(400);
  record('wrong-direction-top-right', {
    during: { matrix: during.matrix, swiping: during.swiping, vars: during.vars },
    stillThere: !!(await find(c)),
    log: await logTail(4),
  });
}

{
  const result = {};
  for (const dx of [-150, 150]) {
    const [, , c] = await setup('top-center');
    await swipe(await bodyPoint(c), dx, 0, { steps: 20, stepMs: 20 });
    await sleep(500);
    result[dx < 0 ? 'left' : 'right'] = (await evaluate('window.__p21.removed()')).includes(c);
  }
  record('centre-both-directions', result);
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  const scrollBefore = await evaluate('window.scrollY');
  await swipe(p, 0, -220, { steps: 12, stepMs: 16 });
  await sleep(600);
  record('vertical-drag-on-toast', {
    scrollBefore,
    scrollAfter: await evaluate('window.scrollY'),
    toast: (await find(c)) && { matrix: (await find(c)).matrix, swiping: (await find(c)).swiping },
    log: await logTail(4),
  });
  await evaluate('window.scrollTo(0, 0)');
}

{
  const result = {};
  for (const [name, dx, dy] of [
    ['45deg', 80, 80],
    ['30deg-from-horizontal', 100, 58],
    ['20deg-from-horizontal', 110, 40],
  ]) {
    await evaluate('window.scrollTo(0, 0)');
    const [, , c] = await setup('top-right');
    const scrollBefore = await evaluate('window.scrollY');
    await swipe(await bodyPoint(c), dx, -dy, { steps: 12, stepMs: 16 });
    await sleep(500);
    result[name] = {
      dismissed: (await evaluate('window.__p21.removed()')).includes(c),
      scrolled: (await evaluate('window.scrollY')) - scrollBefore,
      log: await logTail(3),
    };
  }
  record('diagonal', result);
  await evaluate('window.scrollTo(0, 0)');
}

{
  const result = {};
  const [, b, c] = await setup('top-right');
  const rectOf = selector =>
    evaluate(
      `(() => { const r = document.querySelector('[data-uid="${c}"] ${selector}').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`
    );
  await swipe(await rectOf('.p21-action'), 150, 0, { steps: 20, stepMs: 20 });
  await sleep(400);
  result.dragFromAction = { stillThere: !!(await find(c)), log: await logTail(2) };
  await swipe(await rectOf('.p21-close'), -5, 0, { steps: 1 }); // a tap with a tiny move
  await sleep(400);
  result.tapClose = { log: await logTail(3) };
  await evaluate(`window.__p21.reset('top-right')`);
  const custom = await evaluate('window.__p21.add(true)');
  await sleep(400);
  const inCustom = selector =>
    evaluate(
      `(() => { const r = document.querySelector('[data-uid="${custom}"] ${selector}').getBoundingClientRect(); return { x: Math.round(r.left + 8), y: Math.round(r.top + r.height / 2) }; })()`
    );
  for (const [name, selector] of [
    ['link', 'a'],
    ['input', 'input:not([type])'],
    ['label', 'label'],
    ['roleButton', '[role="button"]'],
    ['tabindexMinus1Child', '[tabindex="-1"]'],
    ['customText', 'strong'],
  ]) {
    await swipe(await inCustom(selector), 150, 0, { steps: 20, stepMs: 20 });
    await sleep(400);
    result[`custom-${name}`] = {
      dismissed: (await evaluate('window.__p21.removed()')).includes(custom),
      log: await logTail(1),
    };
    if (result[`custom-${name}`].dismissed) break;
  }
  void b;
  record('interactive-descendants', result);
}

{
  const [, , c] = await setup('top-right');
  await evaluate('window.__p21.selectText()');
  await swipe(await bodyPoint(c), 150, 0, { steps: 20, stepMs: 20 });
  await sleep(400);
  const blocked = !!(await find(c));
  await evaluate('document.getSelection().removeAllRanges()');
  record('selection-blocks', { blocked, log: await logTail(2) });
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: p.x,
    y: p.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  for (let i = 1; i <= 15; i += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: p.x + i * 12,
      y: p.y,
      button: 'left',
      buttons: 1,
    });
    await sleep(16);
  }
  const during = await find(c);
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: p.x + 180,
    y: p.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: p.x,
    y: p.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: p.x,
    y: p.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);
  record('mouse', {
    duringDrag: {
      matrix: during.matrix,
      swiping: during.swiping,
      reasons: during.reasons,
      gesture: during.gesture,
    },
    stillThere: !!(await find(c)),
    log: await logTail(3),
  });
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: p.x,
    y: p.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'pen',
  });
  for (let i = 1; i <= 15; i += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: p.x + i * 10,
      y: p.y,
      button: 'left',
      buttons: 1,
      pointerType: 'pen',
    });
    await sleep(16);
  }
  const during = await find(c);
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: p.x + 150,
    y: p.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'pen',
  });
  await sleep(400);
  record('pen', {
    duringDrag: during && {
      matrix: during.matrix,
      swiping: during.swiping,
      gesture: during.gesture,
    },
    dismissed: (await evaluate('window.__p21.removed()')).includes(c),
    log: await logTail(4),
  });
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, 70, 0, { lift: false, id: 1 });
  await touch('touchStart', [
    { x: p.x + 70, y: p.y, id: 1 },
    { x: p.x + 20, y: p.y + 4, id: 2 },
  ]);
  for (let i = 1; i <= 6; i += 1) {
    await touch('touchMove', [
      { x: p.x + 70, y: p.y, id: 1 },
      { x: p.x + 20 - i * 15, y: p.y + 4, id: 2 },
    ]);
    await sleep(16);
  }
  const during = await find(c);
  await touch('touchMove', [{ x: p.x + 70, y: p.y, id: 1 }]); // only the second finger lifts
  await sleep(30);
  const afterSecondLift = await find(c);
  await touch('touchCancel', []);
  await sleep(400);
  record('second-pointer-and-pointercancel', {
    duringSecond: { matrix: during.matrix, gesture: during.gesture },
    afterSecondLift: { gesture: afterSecondLift.gesture, swiping: afterSecondLift.swiping },
    afterCancel: (await find(c)) && {
      phase: (await find(c)).phase,
      swiping: (await find(c)).swiping,
      matrix: (await find(c)).matrix,
      reasons: (await find(c)).reasons,
    },
    log: await logTail(6),
  });
}

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, 60, 0, { lift: false });
  // Capture leaves the toast: the pointer moves far below it and keeps driving X.
  await touch('touchMove', [{ x: p.x + 80, y: p.y + 300 }]);
  await sleep(30);
  const outside = await find(c);
  await evaluate(
    `(() => { const el = document.querySelector('[data-uid="${c}"]'); for (let id = 0; id < 50; id += 1) if (el.hasPointerCapture(id)) el.releasePointerCapture(id); })()`
  );
  await sleep(30);
  const afterLost = await find(c);
  await touch('touchEnd', []);
  await sleep(400);
  record('capture-leave-and-lost-capture', {
    outsideToast: { matrix: outside.matrix, gesture: outside.gesture },
    afterLostCapture: {
      gesture: afterLost.gesture,
      swiping: afterLost.swiping,
      reasons: afterLost.reasons,
    },
    final: (await find(c)) && { phase: (await find(c)).phase, matrix: (await find(c)).matrix },
    log: await logTail(5),
  });
}

{
  // A timeout while the gesture is only pending, and the swipe pause holding the timer once active.
  const [, , c] = await setup('top-right', { autoCloseMs: 600 });
  const p = await bodyPoint(c);
  await swipe(p, 60, 0, { lift: false, steps: 6 });
  await sleep(1200); // past the 600 ms auto-close while dragging: held by swipe (and hover)
  const held = await find(c);
  await touch('touchEnd', []);
  await sleep(1500);
  record('swipe-holds-timer', {
    heldWhileDragging: held && { phase: held.phase, reasons: held.reasons },
    afterRelease: (await find(c))?.phase ?? 'removed',
    log: await logTail(6),
  });
}

{
  // D0-11: a programmatic dismissal of the toast under the finger.
  const [, , c] = await setup('top-right', { slow: 5 });
  const p = await bodyPoint(c);
  await swipe(p, 70, 0, { lift: false });
  const before = await find(c);
  const samples = evaluate(`window.__sample(${JSON.stringify(c)}, 900)`);
  await sleep(50);
  await evaluate(`window.__p21.dismiss(${JSON.stringify(c)})`);
  const run = await samples;
  await touch('touchEnd', []);
  await sleep(4000);
  record('foreign-dismiss-during-drag', {
    before: { matrix: before.matrix },
    maxStepLeft: maxStep(run, 'left'),
    firstAfter: run.find(s => s.phase === 'exiting'),
    removedOnce: (await evaluate('window.__p21.removed()')).filter(uid => uid === c).length,
    log: await logTail(6),
  });
}

// --- Composition with P-19 (×5 slow) -----------------------------------------------------

async function composition(name, mode, scenario) {
  const [, , c] = await setup('top-right', { slow: 5, ...mode });
  const out = await scenario(c);
  out.sameRoot = (await find(c))?.sameRoot ?? 'removed';
  out.repositions = (await evaluate('window.__p21.repositions')).slice(-4);
  record(name, out);
}

for (const mode of [
  { seeding: 'composed', dragPolicy: 'freeze' },
  { seeding: 'composed', dragPolicy: 'follow' },
  { seeding: 'production' },
]) {
  const tag = `${mode.seeding}${mode.dragPolicy ? `/${mode.dragPolicy}` : ''}`;

  await composition(`A-stationary-activate [${tag}]`, mode, async c => {
    const before = await find(c);
    await swipe(await bodyPoint(c), 40, 0, { lift: false, steps: 4 });
    const after = await find(c);
    await touch('touchEnd', []);
    await sleep(1500);
    return {
      before: before.matrix,
      afterActivation: after.matrix,
      topDelta: after.top - before.top,
    };
  });

  await composition(`B-activate-mid-reposition [${tag}]`, mode, async c => {
    const p = await bodyPoint(c);
    await evaluate('window.__p21.add()'); // c moves down by a slot, over 1000 ms
    await sleep(300);
    const samples = evaluate(`window.__sample(${JSON.stringify(c)}, 500)`);
    await swipe({ x: p.x, y: p.y + 40 }, 40, 0, { lift: false, steps: 4 });
    const run = await samples;
    await touch('touchEnd', []);
    await sleep(2500);
    const activation = run.findIndex(s => s.swiping === 'drag');
    return {
      maxStepTop: maxStep(run, 'top'),
      aroundActivation: run.slice(Math.max(0, activation - 2), activation + 3),
    };
  });

  await composition(`C-reposition-while-dragging [${tag}]`, mode, async c => {
    const p = await bodyPoint(c);
    await swipe(p, 60, 0, { lift: false });
    const samples = evaluate(`window.__sample(${JSON.stringify(c)}, 600)`);
    await sleep(100);
    await evaluate('window.__p21.add()');
    const run = await samples;
    const during = await find(c);
    const releaseSamples = evaluate(`window.__sample(${JSON.stringify(c)}, 1300)`);
    await touch('touchEnd', []);
    const release = await releaseSamples;
    await sleep(500);
    return {
      maxStepTop: maxStep(run, 'top'),
      maxStepMx: maxStep(run, 'mx'),
      xKept: during.matrix.x,
      frozen: during.vars.y,
      releaseMaxStepTop: maxStep(release, 'top'),
      releaseMaxStepLeft: maxStep(release, 'left'),
      final: (await find(c))?.matrix,
    };
  });

  await composition(`D-reposition-during-snap-back [${tag}]`, mode, async c => {
    const p = await bodyPoint(c);
    await swipe(p, 70, 0, { lift: false });
    const samples = evaluate(`window.__sample(${JSON.stringify(c)}, 1200)`);
    await touch('touchEnd', []); // cancel: a 1000 ms snap-back at ×5
    await sleep(300);
    await evaluate('window.__p21.add()');
    const run = await samples;
    await sleep(800);
    return {
      maxStepMx: maxStep(run, 'mx'),
      maxStepLeft: maxStep(run, 'left'),
      maxStepTop: maxStep(run, 'top'),
      final: (await find(c))?.matrix,
    };
  });

  await composition(`E-reposition-during-fly-out [${tag}]`, mode, async c => {
    const p = await bodyPoint(c);
    await swipe(p, 150, 0, { steps: 20, stepMs: 20, lift: false });
    const samples = evaluate(`window.__sample(${JSON.stringify(c)}, 700)`);
    await touch('touchEnd', []); // commit: fly-out 1000 ms, exit 600 ms at ×5
    await sleep(150);
    await evaluate('window.__p21.add()');
    const run = await samples;
    await sleep(1000);
    return {
      maxStepMx: maxStep(run, 'mx'),
      maxStepLeft: maxStep(run, 'left'),
      firstExiting: run.find(s => s.phase === 'exiting'),
      lastSample: run.filter(s => !s.removed).at(-1),
      removedOnce: (await evaluate('window.__p21.removed()')).filter(uid => uid === c).length,
    };
  });

  await composition(`G-neighbour-removal-while-dragging [${tag}]`, mode, async c => {
    // c is the newest (top); drag the oldest (bottom) instead, and remove the one above it.
    const ordered = (await state()).sort((a, b) => a.top - b.top);
    const dragged = ordered.at(-1).uid;
    const above = ordered.at(-2).uid;
    const p = await bodyPoint(dragged);
    await swipe(p, 60, 0, { lift: false });
    const samples = evaluate(`window.__sample(${JSON.stringify(dragged)}, 1300)`);
    await evaluate(`window.__p21.dismiss(${JSON.stringify(above)})`);
    const run = await samples;
    const during = await find(dragged);
    await touch('touchEnd', []);
    await sleep(1600);
    void c;
    return {
      dragged,
      maxStepTop: maxStep(run, 'top'),
      maxStepMx: maxStep(run, 'mx'),
      xKept: during.matrix.x,
      frozen: during.vars.y,
      sameRootDragged: (await find(dragged))?.sameRoot,
    };
  });
}

// Insertion below a dragged toast in a bottom stack (F): new toasts append at the bottom.
await composition(
  'F-bottom-insert-while-dragging [composed/freeze]',
  { seeding: 'composed', dragPolicy: 'freeze' },
  async () => {
    await evaluate(`window.__p21.reset('bottom-right')`);
    const ids = [];
    for (let i = 0; i < 3; i += 1) ids.push(await evaluate('window.__p21.add()'));
    await sleep(1200);
    const dragged = ids[1];
    const p = await bodyPoint(dragged);
    await swipe(p, 60, 0, { lift: false });
    const samples = evaluate(`window.__sample(${JSON.stringify(dragged)}, 700)`);
    await evaluate('window.__p21.add()');
    const run = await samples;
    const during = await find(dragged);
    await touch('touchEnd', []);
    await sleep(1500);
    return {
      dragged,
      maxStepTop: maxStep(run, 'top'),
      xKept: during.matrix.x,
      frozen: during.vars.y,
      final: (await find(dragged))?.matrix,
    };
  }
);

// --- P-18 composition at ×1: the scale effect on the swipe offset ----------------------------

{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, 150, 0, { steps: 20, stepMs: 20, lift: false });
  const before = await find(c);
  const samples = evaluate(`window.__sample(${JSON.stringify(c)}, 400)`);
  await touch('touchEnd', []);
  const run = await samples;
  record('P-18-exit-composition', {
    atRelease: {
      matrixX: before.matrix.x,
      opacity: before.opacity,
      swipeOpacityVar: before.vars.opacity,
    },
    samples: run.filter((_, i) => i % 2 === 0).slice(0, 12),
  });
}

// --- Reduced motion (emulated media feature) ---------------------------------------------

await load({ reducedMotion: true });
{
  const [, , c] = await setup('top-right');
  const p = await bodyPoint(c);
  await swipe(p, 60, 0, { lift: false });
  const samples = evaluate(`window.__sample(${JSON.stringify(c)}, 150)`);
  await touch('touchEnd', []);
  const cancel = await samples;
  const [, , d] = await setup('top-right');
  const q = await bodyPoint(d);
  await swipe(q, 150, 0, { steps: 20, stepMs: 20, lift: false });
  const tracked = await find(d);
  const commitSamples = evaluate(`window.__sample(${JSON.stringify(d)}, 200)`);
  await touch('touchEnd', []);
  const commit = await commitSamples;
  const [, , e] = await setup('top-right');
  const repositionSamples = evaluate(`window.__sample(${JSON.stringify(e)}, 150)`);
  await evaluate('window.__p21.add()');
  const reflow = await repositionSamples;
  record('reduced-motion', {
    trackingDuringDrag: tracked.matrix,
    cancelFirstFrames: cancel.slice(0, 4),
    commitFrames: commit.slice(0, 5),
    repositionFirstFrames: reflow.slice(0, 3),
  });
}
await load();

// --- RTL: physical directions unchanged --------------------------------------------------

{
  const result = {};
  for (const [position, dx] of [
    ['top-left', -150],
    ['top-left', 150],
    ['top-right', 150],
    ['top-right', -150],
    ['top-center', -150],
    ['top-center', 150],
  ]) {
    const [, , c] = await setup(position, { rtl: true });
    await swipe(await bodyPoint(c), dx, 0, { steps: 20, stepMs: 20 });
    await sleep(500);
    result[`${position} ${dx < 0 ? 'left' : 'right'}`] = (
      await evaluate('window.__p21.removed()')
    ).includes(c);
  }
  result.dir = await evaluate('document.querySelector(".p21-harness").dir');
  record('rtl', result);
}

await send('Target.closeTarget', { targetId: cdp.targetId }).catch(() => {});
cdp.close();
process.stdout.write(JSON.stringify(report, null, 2));
