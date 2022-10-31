import { createAtom } from 'quarx';
import { isFlow, finished, getResult } from 'conclure';
import { autorunAsync } from './core.js';

export function computedAsync(evaluate, options = {}) {
  const {
    name = 'computedAsync',
    equals = (a, b) => a === b
  } = options;

  let result, error;

  function set(e, r) {
    if (e && error === e) return;
    if (!e && equals(result, r)) return;

    [result, error] = [r, e];
    atom.reportChanged();
  }

  function* computation() {
    set(null, yield evaluate());
  }

  const atom = createAtom(
    () => autorunAsync(computation, { name, onError: set, onStale: set }),
    { name: 'result:' + name }
  );

  return {
    get() {
      if (!atom.reportObserved()) {
        const it = evaluate();
        if (!isFlow(it)) return it;
        if (finished(it)) return getResult(it);
        throw it;
      };
      if (error) throw error;
      return result;
    }
  };
}
