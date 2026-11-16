// Encodeur d'images de cartes : DINOv2-small affiné par pokeum (MIT, voir third_party/pokeum),
// quantifié en 8 bits (24 Mo) et exécuté dans le navigateur par ONNX Runtime Web (WebAssembly).
// Une carte redressée → un vecteur de 384 nombres ; deux photos de la même carte donnent des
// vecteurs proches, quels que soient le reflet, le flou ou la lumière.
import * as ort from 'onnxruntime-web/wasm';
// Les deux fichiers du moteur WebAssembly sont servis comme des ressources du site (pas d'un CDN).
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import glueUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';

export const INPUT_SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: glueUrl };
// Plusieurs fils d'exécution exigent une page « cross-origin isolated », ce que Dexup n'est pas
// (les images de cartes viennent d'autres domaines) : un seul fil.
ort.env.wasm.numThreads = 1;

let sessionPromise = null;
export function loadEncoder() {
  sessionPromise ||= ort.InferenceSession.create('/scan/card-encoder.onnx', {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  }).catch((e) => { sessionPromise = null; throw e; });
  return sessionPromise;
}

/** RGBA `INPUT_SIZE`×`INPUT_SIZE` (ImageData.data) → vecteur normalisé (Float32Array). */
export async function encode(rgba) {
  const session = await loadEncoder();
  const n = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i += 1) {
    for (let c = 0; c < 3; c += 1) input[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]) });
  const v = out[session.outputNames[0]].data;
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(v, (x) => x / norm);
}
