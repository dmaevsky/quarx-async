import { createAtom, autorun, Quarx } from 'quarx';
import { conclude, inProgress, isFlow, isIterator } from 'conclure';

if (!Quarx.reactiveFlows) {
  Quarx.reactiveFlows = new WeakMap();
}

export function makeReactive(it, options = {}) {
  const { name = 'makeReactive' } = options;

  if (Quarx.reactiveFlows.has(it)) {
    return Quarx.reactiveFlows.get(it);
  }

  const atom = createAtom(() => {
    const originalNext = it.next;
    const steps = [];

    it.next = value => {
      let result, error;
      let step = steps.length;

      const dispose = autorun(() => {
        if (step !== steps.length) return atom.reportChanged();
        try {
          result = originalNext.call(it, value);

          if (isIterator(result.value)) {
            makeReactive(result.value).reportObserved();
          }
        }
        catch (e) {
          error = e;
        }
      });

      steps.push(dispose);

      if (error) throw error;
      return result;
    };

    return () => {
      it.next = originalNext;
      for (let dispose of steps) dispose();
    };
  }, { name });

  Quarx.reactiveFlows.set(it, atom);
  return atom;
}

export class Stale extends Error {};

export function computedAsync(evaluate, options = {}) {
  const {
    name = 'computedAsync',
    equals = (a, b) => a === b,
    onStale
  } = options;

  let result, error, cancel;

  function start() {
    const stop = autorun(computation);

    return () => {
      if (cancel) cancel();
      cancel = undefined;
      stop();
    };
  }

  const atom = createAtom(start, { name });

  function set(e, r) {
    error = e;
    if (!error) {
      if (equals(result, r)) return;
      result = r;
    }
    atom.reportChanged();
  }

  function computation() {
    try {
      if (cancel) cancel();

      const value = evaluate();

      if (isIterator(value)) {
        makeReactive(value).reportObserved();
      }

      cancel = conclude(value, set);

      if (isFlow(value) && inProgress(value)) {
        set(new Stale(name));
      }
    }
    catch (err) {
      set(err);
    }
  }

  return {
    get: () => {
      if (!atom.reportObserved()) {
        computation();
      };

      if (error instanceof Stale && typeof onStale === 'function') return onStale();
      if (error) throw error;
      return result;
    }
  };
}
