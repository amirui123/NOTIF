/**
 * Redirect the bare specifier `three` (and `three/addons/*`) to the test build
 * of the vendored library so the game can boot without a GPU.
 *
 * Uses the synchronous `module.registerHooks` API (Node ≥ 22.15), which is why
 * `npm test` pins `--import ./test/helpers/setup.js`.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const THREE_TEST = pathToFileURL(resolve(ROOT, 'node_modules/.cache/three.test.mjs')).href;
const THREE_ADDONS = pathToFileURL(resolve(ROOT, 'vendor/three/examples/jsm')).href;

if (existsSync(fileURLToPath(THREE_TEST))) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'three') return { url: THREE_TEST, shortCircuit: true };
      if (specifier.startsWith('three/addons/')) {
        return {
          url: `${THREE_ADDONS}/${specifier.slice('three/addons/'.length)}`,
          shortCircuit: true,
        };
      }
      return nextResolve(specifier, context);
    },
  });
}
