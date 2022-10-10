import test  from 'ava';

import { autorun, observable } from 'quarx';
import { conclude } from 'conclure';
import { delay }  from 'conclure/effects';
import { all }  from 'conclure/combinators';

import { Stale, computedAsync, reactiveFlow, autorunFlow } from '../src/index.js';

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
      if (e instanceof Stale) {
        log('I am still running');
      }
      else console.error(e);
    }
  });
}));

test('multi-step flow', t => new Promise(resolve => {
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
        resolve();
      }
    }
    catch (e) {
      if (e instanceof Stale) log('STALE');
      else console.error(e);
    }
  });
}));

test('delayed reactive function call', t => new Promise(resolve => {
  let count = 0;

  const a = observable.box(5);

  function* g() {
    yield delay(1);
    return a.get();
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
        resolve();
      }
    })
  })
}));

test('reactive combinators', t => new Promise(resolve => {
  let count = 0;

  const a = [observable.box(5), observable.box(6)];

  function* g(i) {
    yield delay(1);
    return a[i].get();
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
        resolve();
      }
    });
  });
}));

test('autorunFlow', t => new Promise(resolve => {
  let count = 0;

  const a = observable.box(5);

  autorunFlow(function* () {
    yield delay(1);
    const aValue = a.get();

    if (++count === 1) {
      t.is(aValue, 5);
      yield delay(1);   // without the delay setting a would create a circular dep here
      a.set(7);
    }
    else if (count === 2) {
      t.is(aValue, 7);
      resolve();
    }
  });
}));
