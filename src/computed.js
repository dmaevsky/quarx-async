import { toObservable } from 'quarx/adapters';
import { subscribableAsync } from './adapters.js';

export function computedAsync(evaluate, options = {}) {
  const {
    name = 'computedAsync',
    equals = (a, b) => a === b
  } = options;

  const subs = subscribableAsync(evaluate, { name });
  return toObservable(subs, { name: `(computedAsync ${name})`, equals });
}
