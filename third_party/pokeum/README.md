# pokeum

Parts of Dexup's card scanner are adapted from [pokeum](https://github.com/TBLgGamin/pokeum)
by TBLgGamin, distributed under the MIT License (see [LICENSE](LICENSE)).

| Dexup file | Adapted from |
| --- | --- |
| `src/lib/quality.js` | `frontend/src/lib/quality.ts` |
| `src/lib/useAutoCapture.js` | `frontend/src/composables/useAutoCapture.ts` |
| `src/lib/scan.js` (`extractCardNumber`) | `app/signals/ocr.py` (`parse_collector_number`) |
| `src/lib/scan.js` (`matchPokemonName`) | `app/signals/name.py` (title-band name matching) |
| `src/lib/vision/geometry.js` | `app/vision/geometry.py` |
| `src/lib/vision/detect.js` | `app/vision/detect.py`, `app/vision/rectify.py` |
| `public/scan/card-encoder.onnx` | `dinov2s-ft-v1.onnx` (release v2.0.0), quantifié en 8 bits (poids dynamiques, ONNX Runtime) |

The scanner's recognition method (detect the card, rectify it, embed it with the fine-tuned DINOv2 encoder and look it up among reference images) follows pokeum's recognition pipeline.
