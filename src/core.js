import { createAtom, autorun, Quarx } from 'quarx';
import { conclude, inProgress, isFlow, isIterator, isEffect } from 'conclure';

if (!Quarx.reactiveFlows) {
  Quarx.reactiveFlows = new WeakMap();
}

export function reportObservedFlow(it, options = {}) {
  const { name = 'reportObservedFlow' } = options;

  const flowType = isFlow(it);

  if (flowType === isIterator) {
    makeReactive(it, options).reportObserved();
  }
  else if (flowType === isEffect && it.fn.combinator) {
    const flows = it.args[0];

    for (let key in flows) {
      reportObservedFlow(flows[key], {
        ...options,
        name: `${name}.${it.fn.combinator}[${key}]`
      });
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
      const stepName = `${name}.${step}`;

      const dispose = autorun(() => {
        if (step !== steps.length) return atom.reportChanged();
        try {
          result = originalNext.call(it, value);

          reportObservedFlow(result.value, { name: stepName });
        }
        catch (e) {
          error = e;
        }
      }, {
        name: stepName,
        onError: () => atom.reportChanged()
      });

      steps.push(dispose);

      if (error) throw error;
      return result;
    };

    return () => {
      it.next = originalNext;
      for (let dispose of steps) dispose();
    };
  }, { name: name + '.*' });

  Quarx.reactiveFlows.set(it, atom);
  return atom;
}

const split = (onError, onStale) => e => isFlow(e) ? onStale(e) : onError(e);

export function autorunAsync(computation, options = {}) {
  const { name = 'autorunAsync' } = options;

  const onStale = options.onStale || (() => {});

  const onError = split(options.onError || function(e) {
    Quarx.error('[Quarx ERROR]', 'async computation', name, e);
  }, onStale);

  let cancel;

  const stop = autorun(() => {
    if (cancel) cancel();

    const it = computation();

    if (isFlow(it)) {
      cancel = conclude(reportObservedFlow(it, { name }), e => e && onError(e));
      if (inProgress(it)) onStale(it);
    }
    else cancel = null;
  }, { name, onError });

  return () => {
    if (cancel) cancel();
    stop();
  }
}
