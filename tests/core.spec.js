import test from 'node:test';
import assert from 'node:assert/strict';

import { createAtom } from 'quarx';
import { box } from 'quarx/box';
import { delay }  from 'conclure/effects';
import { all }  from 'conclure/combinators';

import { autorunAsync, subscribableAsync } from '../src/core.js';

test('delayed reactive function call', () => new Promise(resolve => {
  let count = 0;

  const a = box(5);

  function* g() {
    yield delay(1);
    return a.get();
  }

  const { subscribe } = subscribableAsync(g, { onError: console.error, onStale: () => {} });

  const off = subscribe(res => {
    if (++count === 1) {
      assert.equal(res, 5);
      a.set(7);
    }
    else if (count === 2) {
      assert.equal(res, 7);
      off();
      resolve();
    }
  });
}));

test('reactive combinators', () => new Promise(resolve => {
  let count = 0;

  const a = [box(5), box(6)];

  function* g(i) {
    yield delay(1);
    return a[i].get();
  }

  const { subscribe } = subscribableAsync(() => all([g(0), g(1)]), {
    onError: console.error,
    onStale: () => {}
  });

  const off = subscribe(res => {
    if (++count === 1) {
      assert.deepEqual(res, [5, 6]);
      a[0].set(7);
    }
    else if (count === 2) {
      assert.deepEqual(res, [7, 6]);
      a[1].set(8);
    }
    else if (count === 3) {
      assert.deepEqual(res, [7, 8]);
      off();
      resolve();
    }
  });
}));

test('autorunAsync', () => new Promise(resolve => {
  let count = 0;

  const a = box(5);

  autorunAsync(function* () {
    yield delay(1);
    const aValue = a.get();

    if (++count === 1) {
      assert.equal(aValue, 5);
      yield delay(1);   // without the delay setting a would create a circular dep here
      a.set(7);
    }
    else if (count === 2) {
      assert.equal(aValue, 7);
      resolve();
    }
  });
}));

test('infinitely self-restarting flow', () => new Promise(resolve => {
  const b = box(0);

  function* f() {
    b.set(yield Promise.resolve(b.get() + 1));
  }

  const off = autorunAsync(f, {
    name: 'InfiniteRestart',
    maxRestarts: 5,
    onError: e => {
      assert(e instanceof Error);
      assert.equal(e.message, 'Maximum number of flow restarts (5) exceeded in InfiniteRestart')
      off();
      resolve();
    }
  });
}));

test('subscribableAsync and reactive combinators', async () => {
  const p = Promise.resolve(3);
  const factor = box(0);

  function* f(a) {
    const b = yield p;
    return a + b * factor.get();
  }

  function* evaluate() {
    const [c1, c2] = yield all([f(2), f(-2)]);
    return c1 * c2;
  }

  const { subscribe } = subscribableAsync(evaluate);

  const results = [];
  const off = subscribe(r => results.push(r), e => results.push(e), _ => results.push('STALE'));

  factor.set(2);   // Only this value will be reflected since p is not yet resolved
  await p;
  factor.set(3);

  assert.deepEqual(results, ['STALE', 32, 77]);
  off();
});

test('Stale flows are pushed into onStale channel in subscribableAsync', async () => {
  const p = Promise.resolve();
  const step = box(0);

  function* evaluate() {
    if (step.get() === 0) throw p;
    else if (step.get() === 1) throw 'Foo error';
    yield p;
    return 42;
  }

  const { subscribe } = subscribableAsync(evaluate);

  const results = [];
  const off = subscribe(r => results.push(r), e => results.push(e), _ => results.push('STALE'));

  step.set(1);
  step.set(2);
  await p;

  assert.deepEqual(results, ['STALE', 'Foo error', 'STALE', 42]);
  off();
});

test('Atoms are kept observed till the conclusion of the flow in subscribableAsync', async () => {
  const results = [];

  const atom = createAtom(() => {
    results.push('I am observed');
    return () => {
      results.push('I am NOT observed anymore');
    }
  });

  const promises = [Promise.resolve(5), Promise.resolve(6)];

  const f = idx => function* f() {
    const a = yield promises[idx];
    if (idx === 0) atom.reportObserved();
    return a;
  }

  const step = box(0);

  const { subscribe } = subscribableAsync(() => {
    const path = f(step.get());
    return path();
  });

  const off = subscribe(r => results.push(r), e => results.push(e), _ => results.push('STALE'));
  assert.deepEqual(results, ['STALE']);

  await promises[0];
  assert.deepEqual(results, ['STALE', 'I am observed', 5]);

  step.set(1);
  assert.deepEqual(results, ['STALE', 'I am observed', 5, 'STALE']);

  await promises[1];
  assert.deepEqual(results, ['STALE', 'I am observed', 5, 'STALE', 'I am NOT observed anymore', 6]);

  off();
});
