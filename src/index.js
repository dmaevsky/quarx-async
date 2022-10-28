import { createAtom, autorun, Quarx } from 'quarx';
import { conclude, isFlow, isIterator, isEffect } from 'conclure';

if (!Quarx.reactiveFlows) {
  Quarx.reactiveFlows = new WeakMap();
}

export const reactiveFlow = it => {
  const flowType = isFlow(it);

  if (!flowType && it && typeof it === 'object') {
    (Array.isArray(it) ? it : Object.values(it)).forEach(reactiveFlow);
  }
  else if (flowType === isIterator) {
    makeReactive(it).reportObserved();
  }
  else if (flowType === isEffect) {
    reactiveFlow(it.args);
  }
  return it;
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

          reactiveFlow(result.value);
        }
        catch (e) {
          error = e;
        }
      }, { name: `${name}[${step}]`});

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

export function autorunFlow(computation, options = {}) {
  const { name = 'autorunFlow' } = options;
  const onError = options.onError || function(e) {
    Quarx.error(`[Quarx-async]: uncaught exception in ${name}:`, e);
  }

  let cancel;

  const stop = autorun(() => {
    if (cancel) cancel();

    cancel = conclude(reactiveFlow(computation()), e => e && onError(e));
  }, { name });

  return () => {
    if (cancel) cancel();
    stop();
  }
}
