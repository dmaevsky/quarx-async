import test from 'node:test';
import assert from 'node:assert/strict';

import { autorun, Quarx } from 'quarx';
import { box } from 'quarx/box';
import { isFlow } from 'conclure';

import { computedAsync } from '../src/computed.js';
import { autorunAsync } from '../src/core.js';

test('simple reactive promise', () => new Promise(resolve => {
  const logs = [];
  const log = msg => logs.push(msg);

  const obs = computedAsync(() => Promise.resolve('I am done'));

  autorun(() => {
    try {
      log(obs.get());
      assert.deepEqual(logs, ['I am still running', 'I am done']);
      resolve();
    }
    catch (e) {
      if (isFlow(e)) {
        log('I am still running');
      }
      else console.error(e);
    }
  });
}));

test('multi-step flow', () => new Promise(resolve => {
  const logs = [];
  const log = msg => logs.push(msg);

  const b = box(42);

  function* flow(init) {
    for (let i = 0; i < 5; i++) {
      yield Promise.resolve();
      init++;
    }
    return init + b.get();
  }

  const obs = computedAsync(() => flow(0));

  autorun(() => {
    try {
      log(obs.get());

      if (logs.length === 2) {
        // Avoid circular dependency
        Promise.resolve().then(() => b.set(142));
      }
      else if (logs.length === 4) {
        assert.deepEqual(logs, ['STALE', 47, 'STALE', 147]);
        resolve();
      }
    }
    catch (e) {
      if (isFlow(e)) log('STALE');
      else console.error(e);
    }
  });
}));

test('circular dependency detection, async version', async () => {
  const p1 = Promise.resolve(5);
  const p2 = Promise.resolve(0);
  const latch = box(p1, { name: 'latch' });

  function* computation_a() {
    const d = yield latch.get();
    if (d) return d;
    return b.get();
  }

  function* computation_b() {
    yield latch.get();
    return a.get() + 6;
  }

  const a = computedAsync(computation_a, { name: 'a' });
  const b = computedAsync(computation_b, { name: 'b' });

  const results = [];

  const off = autorunAsync(() => results.push(b.get()), {
    onError: e => results.push(e.message),
    onStale: () => results.push('STALE')
  });

  await p1;

  assert.deepEqual(results, ['STALE', 11]);

  latch.set(p2);
  assert.deepEqual(results, ['STALE', 11, 'STALE']);
  await p2;

  // c1 and c2 are mutually locked in a STALE state -> no updates of results after await
  assert.deepEqual(results, ['STALE', 11, 'STALE', 'STALE']);

  latch.set(42);
  assert.deepEqual(results, ['STALE', 11, 'STALE', 'STALE', 48]);

  const originalQuarxError = Quarx.error;

  const quarxErrors = [];
  Quarx.error = (...args) => quarxErrors.push(args);

  latch.set(0);   // BOOM
  assert.deepEqual(results, ['STALE', 11, 'STALE', 'STALE', 48, '[Quarx ERROR]:cycle detected:b:b.1:a:a.1:b']);

  Quarx.error = originalQuarxError;

  assert.equal(quarxErrors.length, 4);
  off();
});
