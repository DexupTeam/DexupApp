// Modèles du scanner CardCorpus (voir scripts/scanner/export_models.py et third_party/cardcorpus),
// exécutés dans le navigateur par ONNX Runtime Web (WebAssembly).
import * as ort from 'onnxruntime-web/wasm';
// Les deux fichiers du moteur WebAssembly sont servis comme des ressources du site (pas d'un CDN).
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import glueUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: glueUrl };
// Plusieurs fils d'exécution exigent une page « cross-origin isolated », ce que Dexup n'est pas
// (les images de cartes viennent d'autres domaines) : un seul fil.
ort.env.wasm.numThreads = 1;

export { ort };

const sessions = {};
/** Session ONNX d'un modèle de /scan/ (`detector`, `matcher` ou `number`), créée une fois. */
export function model(name) {
  sessions[name] ||= ort.InferenceSession.create(`/scan/${name}.onnx`, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  }).catch((e) => { delete sessions[name]; throw e; });
  return sessions[name];
}

export async function run(name, feeds) {
  const session = await model(name);
  return session.run(feeds);
}
