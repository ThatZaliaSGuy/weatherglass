# Weatherglass — source

A miniature living landscape sealed in a glass box. Grab clouds, squeeze out rain, blow wind,
build storms, move the sun and turn the seasons.

**Play it:** https://thatzaliasguy.github.io/weatherglass/

## Run

```sh
cd source
npm install
npm run dev      # dev server with hot reload
npm run build    # writes dist/index.html, one self-contained file
npm run preview  # serves the built file
```

`dist/index.html` is the same kind of single file as `index.html` at the repo root, which is what GitHub Pages serves. To update the live page, build and copy `dist/index.html` over the root `index.html`.

## Layout

| Folder | What's in it |
| --- | --- |
| `src/main.js` | Boot: renderer, modules, the simulate/render loop and the `window.__wg` debug API |
| `src/core` | Scene constants, event bus, quality tiers, camera rig, scenarios, profiler |
| `src/render` | Renderer, post-processing (bloom, tilt-shift, grade), lighting |
| `src/world` | Terrain shape, sampling, geometry, materials, paths, rocks, world/season state |
| `src/water` | Lake, ripples, reflections, river, waterfall, particles, fish, lily pads |
| `src/vegetation` | Trees, bushes, grass, flowers, reeds and their wind/season shaders |
| `src/glass` | The glass case: frame, plinth, plaques, gauges, panes, condensation |
| `src/sky` | Sun/moon orbit and bodies, atmosphere, stars, rainbow, aurora |
| `src/life` | Cabin and props, boat, smoke, birds, insects, falling leaves, wind wisps |
| `src/clouds` | Cloud noise, raymarched cloud material, cloud bodies and the cloud system |
| `src/weather` | Wind field, ground cover, precipitation, lightning, fog |
| `src/ui` | HUD: toolbar, season dial, time slider, thermometer, coach, toasts |
| `src/audio` | Procedural Web Audio sound effects, wildlife and ambience |
| `src/input`, `src/tools` | Pointer input and the wind tool |

Debug URL options: `?paused`, `?warm=<seconds>`, `?cam=<preset>`, `?stats`, `?quality=<level>`.

## About this source

This project was rebuilt from the published single-file build, because the original source
wasn't available. three.js is the npm package (`three@0.186.0`), not a bundled copy. The app
code was split back into modules and every top-level class, function and constant was given a
descriptive name. Variables inside functions still carry short minified names (`t`, `e`, `i`),
and the original comments are gone.
