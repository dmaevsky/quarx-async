import test  from 'ava';

import { autorun } from 'quarx';
import { box } from 'quarx/box';
import { conclude } from 'conclure';
import { delay }  from 'conclure/effects';
import { all }  from 'conclure/combinators';

import { reportObservedFlow, autorunAsync } from '../src/core.js';

test('delayed reactive function call', t => new Promise(resolve => {
  let count = 0;

  const a = box(5);

  function* g() {
    yield delay(1);
    return a.get();
  }

  autorun(() => {
    conclude(reportObservedFlow(g()), (err, res) => {
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

  const a = [box(5), box(6)];

  function* g(i) {
    yield delay(1);
    return a[i].get();
  }

  autorun(() => {
    conclude(reportObservedFlow(all([g(0), g(1)])), (err, res) => {
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

test('autorunAsync', t => new Promise(resolve => {
  let count = 0;

  const a = box(5);

  autorunAsync(function* () {
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
