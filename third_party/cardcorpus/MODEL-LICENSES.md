# Licences

The files in this repository are under different licences. Using the
scanner as a whole means accepting each of them.

| file | what it is | licence |
|---|---|---|
| `models/matcher.safetensors` | card matcher, a fine-tune of DINOv3 ViT-S/16 | [DINOv3 License](LICENSES/DINOv3-License.md) |
| `models/picker.safetensors` | print picker, a fine-tune of PE-Core S/16 | [Apache 2.0](LICENSES/Apache-2.0.txt) |
| `models/detector.safetensors` | QuadDet card detector (from timm's MobileNetV4-small ImageNet weights) | [Apache 2.0](LICENSES/Apache-2.0.txt) |
| `models/number-reader.safetensors`, `models/number-reader.json` | collector number reader | [Apache 2.0](LICENSES/Apache-2.0.txt) |
| `models/heads.safetensors` | orientation head and card-back prototype | [Apache 2.0](LICENSES/Apache-2.0.txt) |
| `pipeline.json` | the scanner's settings | [Apache 2.0](LICENSES/Apache-2.0.txt) |
| `index/` | the reference index: fingerprints of card pictures and the cards they show | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Built with DINOv3. The matcher, and anything derived from it, may only be
distributed under the DINOv3 License with a copy of it.

The index records, for each fingerprint, the card it shows as the
[CardCorpus dataset](https://cardcorpus.com) addresses it, with the card's
name, set and printed number. It holds fingerprints, not card pictures.

Pokémon and Pokémon character names are trademarks of Nintendo, Creatures
and GAME FREAK. Card pictures and text are © The Pokémon Company,
Nintendo, Creatures, GAME FREAK and, for older cards, Wizards of the
Coast. This project is not produced, endorsed, sponsored or supported by,
or affiliated with, any of them. The licences above cover the CardCorpus
Authors' own work and grant no rights in theirs.
