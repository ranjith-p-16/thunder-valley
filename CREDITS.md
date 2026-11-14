# Credits

Thunder Valley is an original game. Its code, story, characters, sound and hand-built models were made for it.

## Third-party work

| What | Author | Licence | Where it is |
|---|---|---|---|
| three.js 0.170.0 (3D engine, loaders, post-processing) | three.js authors | MIT | `vendor/three/` |
| Dinosaur models: velociraptor, triceratops, tyrannosaur, stegosaurus, parasaurolophus, apatosaurus | Quaternius | CC0 1.0 (public domain) | `assets/*.glb` |
| Stylized Nature MegaKit: trees, rocks, bushes, flowers | Quaternius | CC0 1.0 (public domain) | `assets/nature/` |
| People: man, man in suit, woman, woman casual, woman in dress, farmer, worker, hooded adventurer | Quaternius | CC0 1.0 (public domain) | `assets/people/` |
| Buildings: fantasy inn, fantasy house, fantasy stable, small watch tower | Quaternius | CC0 1.0 (public domain) | `assets/town/` |

All models were downloaded from Poly Pizza (poly.pizza). The people are trimmed to the animations the game uses by `tools/trim-glb.mjs`. The nature models are repacked from the originals (textures shared between models and converted to WebP) by `tools/repack-nature.mjs`.

All sound is generated in the browser by code; there are no audio files.
