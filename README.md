# Thunder Valley

A 3D browser game of dinosaurs on the frontier. Dustfork is a town under a gang's thumb: earn its trust, herd longhorns, tame a string of dinosaurs, build a posse and take the town for your own. Single player, 18 story quests with four endings.

It runs as plain files in the browser: no install and no build step.

## Play it locally

```bash
python3 serve.py 8911
```

Then open http://localhost:8911. The game needs a web server (it will not run from a `file://` address) and a browser with WebGL 2.

Add `?q=low` to the address to force low graphics, or `?q=high` to force high. Otherwise the Settings panel on the title screen decides.

## Put it online

```bash
node tools/build.mjs
```

This writes `dist/` (about 13 MB): upload that folder to any static host. Nothing in it needs a server-side language.

## Controls

The full list is on the title screen. The essentials: `WASD` ride, mouse aim, click fire, `Shift` sprint, `Space` mount ability, `Y` or right click for the second move, `V` strike, `T` tame, `B` next dinosaur, `F` talk or use a building, `M` map, `J` journal, `P` pause, `N` sound.

## Settings

Graphics quality, mouse sensitivity, inverted look, camera shake, text size, volume and a high-contrast map are in the Settings panel on the title and pause screen. They are stored in the browser, apart from the save.

## Saves

One save, stored in the browser and written automatically. Export and Import on the menu move it between browsers as a file.

## Layout

| Folder | What is in it |
|---|---|
| `src/sim` | The rules. No drawing and no browser APIs: runs in Node for the tests |
| `src/data` | Every number and every line of story |
| `src/render`, `src/ui`, `src/input`, `src/audio`, `src/save` | Drawing, screens, controls, sound, storage |
| `assets` | Models (see `CREDITS.md`) |
| `vendor/three` | three.js, vendored |
| `tests` | Scripted checks of the rules; `tests/playtest` holds testers' one-off scripts |
| `tools` | `build.mjs` (make `dist/`), `repack-nature.mjs` (shrink the nature models) |
| `art-source` | The original, unshrunk nature models. Not needed to run or ship the game |

## Tests

```bash
npm test
```

Needs Node 18 or newer.
