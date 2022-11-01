import { autorunAsync } from './core.js';

export function subscribableAsync(evaluate, options = {}) {
  return {
    subscribe(
      subscriber,
      onError = options.onError,
      onStale = options.onStale
    ) {
      function* computation() {
        subscriber(yield evaluate());
      }

      return autorunAsync(computation, {
        onError,
        onStale,
        name: options.name || 'subscribableAsync'
      });
    }
  };
}
