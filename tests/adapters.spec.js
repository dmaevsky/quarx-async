import test  from 'ava';

import { box } from 'quarx/box';
import { all } from 'conclure/combinators';
import { subscribableAsync } from '../src/adapters.js';

test('subscribableAsync and reactive combinators', async t => {
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

  t.deepEqual(results, ['STALE', 32, 77]);
  off();
});

test('Stale flows are pushed into onStale channel in subscribableAsync', async t => {
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

  t.deepEqual(results, ['STALE', 'Foo error', 'STALE', 42]);
  off();
});
