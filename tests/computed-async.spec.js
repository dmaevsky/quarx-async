import test  from 'ava';

import { autorun } from 'quarx';
import { box } from 'quarx/box';
import { isFlow } from 'conclure';

import { computedAsync } from '../src/computed-async.js';

test('simple reactive promise', t => new Promise(resolve => {
  const logs = [];
  const log = msg => logs.push(msg);

  const obs = computedAsync(() => Promise.resolve('I am done'));

  autorun(() => {
    try {
      log(obs.get());
      t.deepEqual(logs, ['I am still running', 'I am done']);
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

test('multi-step flow', t => new Promise(resolve => {
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
        t.deepEqual(logs, ['STALE', 47, 'STALE', 147]);
        resolve();
      }
    }
    catch (e) {
      if (isFlow(e)) log('STALE');
      else console.error(e);
    }
  });
}));
