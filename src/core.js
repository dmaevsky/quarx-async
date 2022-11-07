import { createAtom, autorun, Quarx } from 'quarx';
import { conclude, inProgress, isFlow, isIterator, isEffect } from 'conclure';

const reactive = Symbol.for('@@quarx-async-reactive');
const stale = Symbol.for('@@quarx-async-stale');

const noop = () => {};

function getProcessor(it) {
  const flowType = isFlow(it);

  if (flowType === isIterator) return makeReactiveIterator;
  if (flowType === isEffect && it.fn.combinator) return makeReactiveEffect;
}

export function makeReactive(it, callback, options = {}) {
  const processor = getProcessor(it);
  if (!processor) return noop;

  if (stale in it) {
    callback(it[stale]);
    return noop;
  }

  if (reactive in it) {
    const subscribe = it[reactive];
    return subscribe(callback);
  }

  const subscribers = new Set();

  const onInvalidate = reason => {
    if (stale in it) return;

    it[stale] = reason;
    delete it[reactive];

    for (let cb of subscribers) cb(reason);
  }

  function subscribe(cb) {
    subscribers.add(cb);

    return () => {
      const deleted = subscribers.delete(cb);

      if (deleted && subscribers.size === 0) {
        delete it[reactive];
        cleanup();
      }
    }
  }

  it[reactive] = subscribe;

  const unsubscribe = subscribe(callback);

  const cleanup = processor(it, onInvalidate, options);

  return unsubscribe;
}

function makeReactiveEffect(it, callback, { name = 'reactiveEffect' }) {
  const subscriptions = [];
  const flows = it.args[0];

  for (let key in flows) {
    subscriptions.push(makeReactive(flows[key], callback, {
      name: `${name}.${it.fn.combinator}[${key}]`
    }));
  }

  return () => subscriptions.forEach(off => off());
}

function makeReactiveIterator(it, callback, { name = 'reactiveIterator' }) {
  const subscriptions = [];
  let step = 0;

  const reactiveShell = original => (...args) => {
    let result, error;
    const stepName = `${name}.${step++}`;

    const dispose = autorun(() => {
      try {
        result = original.call(it, ...args);
      }
      catch (e) {
        error = e;
      }
    }, {
      name: stepName,
      once: true,
      onError: callback
    });

    subscriptions.push(dispose);

    if (error) throw error;

    subscriptions.push(makeReactive(result.value, callback, { name: stepName }));
    return result;
  }

  const originalNext = it.next;
  const originalThrow = it.throw;

  it.next = reactiveShell(originalNext);
  it.throw = reactiveShell(originalThrow);

  return () => {
    it.next = originalNext;
    it.throw = originalThrow;
    for (let dispose of subscriptions) dispose();
  }
}

const splitInto = (onError, onStale) => e => isFlow(e) ? onStale(e) : onError(e);

export function subscribableAsync(evaluate, options = {}) {
  const {
    name = 'subscribableAsync',
    maxRestarts = 20
  } = options;

  return {
    subscribe(
      subscriber,
      onError = options.onError,
      onStale = options.onStale
    ) {
      const onErrorStale = splitInto(onError, onStale);

      let cancel;
      let restarts = [];

      function cleanup() {
        for (let off of restarts) off();
        if (cancel) cancel();
      }

      const restartAtom = createAtom(() => cleanup, {
        name: `(restart ${name})`
      });

      return autorun(() => {
        if (restarts.length >= maxRestarts) {
          return onError(new Error(`Maximum number of flow restarts (${maxRestarts}) exceeded in ${name}`));
        }

        if (cancel) cancel();

        const it = evaluate();

        if (isFlow(it)) {
          restartAtom.reportObserved();

          restarts.push(makeReactive(it, () => restartAtom.reportChanged(), { name }));

          cancel = conclude(it, (error, result) => {
            const lastRun = restarts.pop();

            for (let off of restarts) off();
            restarts = [lastRun];

            if (error) onErrorStale(error);
            else subscriber(result);
          });

          if (inProgress(it)) onStale(it);
        }
        else {
          cancel = null;
          subscriber(it);
        }
      }, { name, onError: onErrorStale });
    }
  }
}

export function autorunAsync(computation, options = {}) {
  const onError = options.onError || function(e) {
    Quarx.error('[Quarx ERROR]', 'async computation', options.name || 'autorunAsync', e);
  }

  const onStale = options.onStale || noop;

  const { subscribe } = subscribableAsync(computation, options)
  return subscribe(noop, onError, onStale);
}
