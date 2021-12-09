import test  from 'ava';

import { autorun, observable } from 'quarx';
import { conclude } from 'conclure';
import { delay }  from 'conclure/effects';
import { all }  from 'conclure/combinators';

import { Stale, computedAsync, reactiveFlow } from '../src/index.js';

function* delayed(ms, value) {
  yield delay(ms);
  return value;
}

test.cb('simple reactive promise', t => {
  const logs = [];
  const log = msg => logs.push(msg);

  const obs = computedAsync(() => Promise.resolve('I am done'));

  autorun(() => {
    try {
      log(obs.get());
      t.deepEqual(logs, ['I am still running', 'I am done']);
      t.end();
    }
    catch (e) {
      if (e instanceof Stale) {
        log('I am still running');
      }
      else console.error(e);
    }
  });
});

test.cb('multi-step flow', t => {
  const logs = [];
  const log = msg => logs.push(msg);

  const b = observable.box(42);

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
        t.end();
      }
    }
    catch (e) {
      if (e instanceof Stale) log('STALE');
      else console.error(e);
    }
  });
})

test.cb('delayed reactive function call', t => {
  let count = 0;

  const a = observable.box(5);

  function* g() {
    const f = yield delayed(1, () => a.get());
    return f();
  }

  autorun(() => {
    conclude(reactiveFlow(g()), (err, res) => {
      if (err) throw err;
      if (++count === 1) {
        t.is(res, 5);
        a.set(7);
      }
      else if (count === 2) {
        t.is(res, 7);
        t.end();
      }
    })
  })
});

test.cb('reactive combinators', t => {
  let count = 0;

  const a = [observable.box(5), observable.box(6)];

  function* g(i) {
    const f = yield delayed(1, () => a[i].get());
    return f();
  }

  autorun(() => {
    conclude(reactiveFlow(all([g(0), g(1)])), (err, res) => {
      if (err) throw err;
      if (++count === 1) {
        t.deepEqual(res, [5, 6]);
        a[0].set(7);
      }
      else if (count === 2) {
        t.deepEqual(res, [7, 6]);
        a[1].set(8);
      }
      else if (count === 3) {
        t.deepEqual(res, [7, 8]);
        t.end();
      }
    });
  });
});
