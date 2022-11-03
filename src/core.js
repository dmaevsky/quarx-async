import { createAtom, autorun, Quarx } from 'quarx';
import { conclude, inProgress, isFlow, isIterator, isEffect } from 'conclure';

if (!Quarx.reactiveFlows) {
  Quarx.reactiveFlows = new WeakMap();
}

export const reportObservedFlow = it => {
  const flowType = isFlow(it);

  if (flowType === isIterator) {
    makeReactive(it).reportObserved();
  }
  else if (flowType === isEffect && it.fn.combinator) {
    const flows = it.args[0];

    for (let flow of (Array.isArray(flows) ? flows : Object.values(flows))) {
      reportObservedFlow(flow);
    }
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

          reportObservedFlow(result.value);
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

export function autorunAsync(computation, options = {}) {
  const { name = 'autorunAsync' } = options;

  const onError = options.onError || function(e) {
    Quarx.error(`[Quarx-async]: uncaught exception in ${name}:`, e);
  }

  const onStale = options.onStale || (() => {});

  let cancel;

  const stop = autorun(() => {
    if (cancel) cancel();

    const it = computation();

    if (isFlow(it)) {
      cancel = conclude(reportObservedFlow(it), e => e && (isFlow(e) ? onStale(e) : onError(e)));
      if (inProgress(it)) onStale(it);
    }
    else cancel = null;
  }, { name, onError });

  return () => {
    if (cancel) cancel();
    stop();
  }
}
