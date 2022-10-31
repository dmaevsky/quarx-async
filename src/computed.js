import { createAtom, autorun } from 'quarx';
import { conclude, inProgress, isFlow } from 'conclure';
import { reactiveFlow } from './core.js';

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

      reactiveFlow(value);

      cancel = conclude(value, set);

      if (isFlow(value) && inProgress(value)) {
        set(value);
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

      if (isFlow(error) && typeof onStale === 'function') return onStale(error);
      if (error) throw error;
      return result;
    }
  };
}
