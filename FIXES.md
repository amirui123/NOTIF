# FIXES — what was broken in the original single-file build

The delivered `ggfrty.html` was a 2,639-line prototype. It looked impressive on the menu but
fell over in practice. This document lists every bug that was found and how it is fixed in
the rewrite. Each item is either covered by an automated test or verified manually.

Legend: **🔴 crash / blocker · 🟠 gameplay bug · 🟡 visual/polish · 🔵 code quality**

---

## Blockers

| #   | Bug                                                                                                                                                                                                                           | Fix                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🔴 **The map was never built.** `TacticalMap.build()` was defined but never called, so the scene contained no level geometry, no colliders and no spawn nodes. Deploying spawned zero enemies and you fell through the world. | `Game` now calls `level.build()` during construction; the integration test asserts spawn nodes and wave spawning.                       |
| 2   | 🔴 **The first frame crashed in the menu** — the orbit camera dereferenced `this.vm.root` before a weapon was equipped (`TypeError: Cannot read properties of null`).                                                         | Null-safe in `renderOrbit()` / `#updateGameplay()`.                                                                                     |
| 3   | 🔴 **Every fatal error was invisible.** The error handler wrote into `#fatal-error`, whose CSS was `display:none`, so any failure produced a silent black screen. `unhandledrejection` was not handled at all.                | `core/errors.js` shows a styled, actionable error panel and handles `error` + `unhandledrejection`; the loader is dismissed on failure. |
| 4   | 🔴 **The game required a CDN at runtime.** three.js was loaded from `cdn.jsdelivr.net` via an import map — no internet, no game.                                                                                              | three.js r170 is vendored in `vendor/three/`, import map points at local files; tested by the "serves vendored three.js" case.          |
| 5   | 🔴 **The reload state machine added ammunition every frame.** While `p > 0.72` the transfer block re-ran each tick, so a 2-second reload could add hundreds of rounds (and could exceed `reserveMax`).                        | A `reloadFlags.inserted` latch guarantees exactly one transfer; asserted by "refills the magazine exactly once".                        |
| 6   | 🔴 **Web Audio leaked PannerNodes forever.** Every enemy shot created a panner that was never disconnected; after a few minutes the graph stalled and audio died.                                                             | `#spatial()` auto-disconnects after a lifetime; voices are capped at 24.                                                                |

## Gameplay

| #   | Bug                                                                                                                                                                                    | Fix                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7   | 🟠 Grenades were **cosmetic only** — `FXManager.detonate()` called a callback that no one ever supplied, so frags dealt zero damage.                                                   | `FXManager.setExplosionHandler()` is wired to the game; covered by `grenade.test.js`.                                                                              |
| 8   | 🟠 The **damage direction indicator pointed the wrong way**: the bearing was computed in world space and then rotated by yaw a second time.                                            | `relativeBearingDeg()` projects the attacker into camera space; unit tested.                                                                                       |
| 9   | 🟠 **Crouch locked the player under roofs** — nothing checked headroom before standing.                                                                                                | `#hasHeadroom()` probes colliders above the eye line.                                                                                                              |
| 10  | 🟠 **Semi-auto weapons could fire twice per click** (`mousedown` called `tryFire` and the update loop called it again).                                                                | Single trigger edge: `triggerHeld` for autos, `triggerPressed` for semi-autos.                                                                                     |
| 11  | 🟠 The **mouse wheel swapped weapons on every scroll notch**, including accidental trackpad scrolls.                                                                                   | Input accumulates deltas and requires a deliberate 60 px (or 3 lines) gesture.                                                                                     |
| 12  | 🟠 **Key auto-repeat toggled gadgets rapidly** — holding `C`, `N` or `T` flickered crouch/NVG/laser dozens of times per second.                                                        | `Input` filters `e.repeat` and already-down keys.                                                                                                                  |
| 13  | 🟠 **Bolt-action weapons never ejected a casing** (`boltDelay === 0` skipped the branch for semi-autos, and the bolt branch only ran for the Kar98k).                                  | Casings are ejected per shot for autos/semi-autos and during the bolt cycle for bolt guns.                                                                         |
| 14  | 🟠 **Enemies could spawn behind the player's back wall**, appear inside geometry, or (after 3 waves) stop spawning entirely because deleted spawn nodes left `spawnNodes` unavailable. | Spawn scoring prefers out-of-sight-but-reachable nodes, validates against geometry, falls back to a smoke-covered far node, and guards against an empty node list. |
| 15  | 🟠 Dead enemies kept **hitboxes parented to the scene**, so shots at corpses registered hits and stole kills from live targets.                                                        | Hitboxes are detached on death and disposed with the body.                                                                                                         |
| 16  | 🟠 Enemy AI ran a **line-of-sight raycast for every enemy every frame** (7 raycasts at 60 fps against the whole map).                                                                  | LOS is throttled to ~8 Hz per enemy and the raycaster is shared.                                                                                                   |
| 17  | 🟠 **Space scrolled the page** and Tab moved focus out of the game while playing.                                                                                                      | The input layer consumes scroll keys and Tab in game mode.                                                                                                         |
| 18  | 🟠 **Audio never resumed** after tab switches or after the browser suspended the context.                                                                                              | `resume()` is called on pointer-lock gain, on deploy and on visibility change.                                                                                     |
| 19  | 🟠 **Settings were not persisted** — weather, quality, sensitivity and operator were lost on reload.                                                                                   | Stored in `localStorage` with a fail-safe wrapper (Safari private mode).                                                                                           |
| 20  | 🟠 The **summary box never hid** after redeploying; the “NEW DEPLOYMENT” button was toggled with inline styles.                                                                        | `Menu.show()/hide()` own that state via the `hidden` attribute.                                                                                                    |

| 20a | 🟠 **Overhead geometry shoved the player sideways.** Ceilings, awnings and catwalks were resolved with the same circle-vs-box push as walls, so walking under any roof teleported the player sideways — and because the spawn sits under a catwalk, you could not leave the start area. | Head-height colliders are split out: they clamp the jump arc (`#clampHead`) instead of pushing laterally. Regression-tested by `player.test.js` and `collision.test.js`. |
| 20b | 🟠 **Pointer lock failed silently in embedded previews and Safari**, leaving the camera frozen and the game unplayable. | `Input` falls back to lock-free mouse look, hides the cursor, and shows a one-time explanation. |

## Visual / UX

| #   | Bug                                                                                                                       | Fix                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 21  | 🟡 The **HUD wrote ~15 DOM properties per frame**, forcing layout 60×/s.                                                  | `Hud` diffs values and only writes on change.                                              |
| 22  | 🟡 Spark/blood/dust particles allocated **a new material per particle**, compiling shaders mid-firefight (frame hitches). | Materials are pooled and shared per effect; only meshes are pooled.                        |
| 23  | 🟡 Viewmodel swaps **leaked every geometry, material and texture** (~40 objects per weapon swap).                         | `buildViewmodel()` returns a `dispose()`; swap and mission restart free the GPU resources. |
| 24  | 🟡 The viewmodel cast **shadows onto the player camera**, producing giant shadow blobs.                                   | Viewmodel meshes never cast or receive shadows.                                            |
| 25  | 🟡 The laser line started at a **hard-coded local offset** and didn't follow the muzzle; the dot lived in camera space.   | Both are computed per frame from the real muzzle and the world-space hit point.            |
| 26  | 🟡 The compass was **not smooth** and drifted from the actual heading.                                                    | Single `formatBearing()` source of truth, unit tested.                                     |
| 27  | 🟡 The NVG overlay stayed **fully green after toggling the camera off**, and night mode hard-forced it.                   | Uniforms are eased toward the target in one place.                                         |
| 28  | 🟡 Loading had **no feedback** — the boot spike (texture baking) looked like a freeze.                                    | Progress bar with staged labels; textures bake inside `Game` with progress callbacks.      |
| 29  | 🟡 No `prefers-reduced-motion` support, no focus-visible styles, no mobile layout.                                        | Added; the HUD collapses gracefully under 720 px and touch devices get a clear notice.     |
| 30  | 🟡 Operator cards were `<button>`s styled as divs with **no keyboard focus ring**.                                        | Real buttons with `aria-pressed`, `:focus-visible` rings and a labelled dialog.            |

## Code quality

| #   | Bug                                                                                                 | Fix                                                                                     |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 31  | 🔵 Everything lived in **one 2,639-line file** with mixed concerns (data, shaders, AI, DOM, audio). | Split into 19 focused ES modules with explicit dependencies.                            |
| 32  | 🔵 Weapon/operator/enemy **data was hard-coded inside the game loop**.                              | `src/config.js`, frozen, validated by unit tests.                                       |
| 33  | 🔵 Magic numbers for time, damage and speeds were scattered inline.                                 | Named constants per module.                                                             |
| 34  | 🔵 `innerHTML` string building in the UI.                                                           | `textContent` + `createElement` everywhere.                                             |
| 35  | 🔵 No tests, no lint, no CI, no README.                                                             | ESLint 9 flat config, Prettier, 119 tests, GitHub Actions CI + Pages deploy, full docs. |
| 36  | 🔵 No teardown path (`dispose`) — resources could never be freed.                                   | Every manager implements `dispose()`; `Game.dispose()` tears the whole thing down.      |

---

## Second audit round

Fourteen more defects, found by driving **real DOM events** and rasterising real
frames instead of calling game internals directly. They were invisible to
internals-level tests because the breakage lived in the wiring between modules.

| #   | Bug                                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 37  | 🔴 **Mouse look, firing, ADS and weapon swap did not work at all.** `Game` assigned callbacks as properties (`input.onMove = fn`) while `Input` defines registration _methods_ (`onMove(fn)`). Overwriting the methods left every listener slot `undefined`. | Wiring goes through the methods; a test dispatches real `mousemove` / `mousedown` / `wheel` / `pointerlockchange` events and asserts the camera turns, a round is consumed, ADS engages and the slot swaps. |
| 38  | 🟠 **Bullets fell through the enemy model.** The head/torso/leg hit volumes did not meet — a 7.5 cm hole at waist height and 4 cm at the neck. Chest-height shots on a static target passed straight through.                                                | Volumes are larger and overlap, so a seam can never swallow a hit.                                                                                                                                          |
| 39  | 🟠 **Cone spread was not a cone.** An independent random offset on each world axis made diagonal shots land up to ~1.7× further from the aim point than intended.                                                                                            | Uniform disc sample around the true aim: exactly `spread` radians of deviation in every direction.                                                                                                          |
| 40  | 🟠 **Enemies wedged against the first obstacle.** No step-up, no detour, no recovery: a spawned enemy stopped dead 29 m out and vibrated there for the rest of the match, so waves never reached the player.                                                 | Shin-height step-up, tangent probing with a committed detour, unstick-on-free-movement, bounds clamping.                                                                                                    |
| 41  | 🟠 **The laser was on by default** and its geometry was only written while visible, so switching it off left a 65 m green beam across the map plus a dot stranded in world space.                                                                            | Off by default; hiding collapses the geometry; the world dot is only added when it has a real impact.                                                                                                       |
| 42  | 🟡 **The weapon turned black at night.** Metalness 0.85 with no light of its own, and the night preset drops the sun to 0.55 with a dark blue hemisphere.                                                                                                    | Camera-parented fill light scaled per preset (0.6 / 0.9 / 2.2) with a 3.2 m falloff that never reaches the world. The camera is in the scene graph, which such a light requires.                            |
| 43  | 🟡 **The compass was mis-calibrated.** One text node scrolled at an assumed 1.9 px/degree against real metrics of ~2.03, so the letter under the reticle drifted about a tick per turn.                                                                      | Ticks are individual elements placed at exact 22.5° intervals using the same constant that scrolls the track.                                                                                               |
| 44  | 🟡 **The click-to-capture banner could not be clicked.** It lived inside `#hud` (`pointer-events: none`) and had no handler, so a dropped pointer lock was an unrecoverable dead end.                                                                        | Sibling overlay with click and Enter/Space handling, focus management, and a one-time explanation in lock-free mode.                                                                                        |
| 45  | 🟡 **Ammo pickups left the magazine empty** — you could stand on one at 3 rounds with 150 in reserve, which reads as a broken pickup.                                                                                                                        | The active weapon refills from its own reserve, bounded by `magSize` and by what the reserve holds.                                                                                                         |
| 46  | 🟡 **Pause offered NEW DEPLOYMENT** with no confirmation and took focus away from Resume.                                                                                                                                                                    | Confirmation prompt, focus returns to the primary action, restart hidden on the game-over screen.                                                                                                           |
| 47  | 🟡 **The bodycam clock showed UTC** and the OSD always claimed 94 % battery.                                                                                                                                                                                 | Local time; the OSD reports the renderer instead of inventing a battery level.                                                                                                                              |
| 48  | 🟡 **Overhead geometry shoved the player sideways** — walking under any roof teleported you sideways, and the spawn sits under a catwalk, so the level was effectively sealed.                                                                               | Head-height colliders clamp the jump arc (`#clampHead`) instead of pushing laterally.                                                                                                                       |
| 49  | 🟡 **Mobile/short viewports collided**: the vitals and weapon panels overlapped, and nothing was hidden on a 1366×640 laptop.                                                                                                                                | Layout rules for `max-width: 720px` and `max-height: 620px`; HUD collapses in a defined order.                                                                                                              |
| 50  | 🟡 **Health and armour bars re-scaled their gradient** with the fill width, so a near-empty bar still looked green/blue.                                                                                                                                     | Gradients are track-sized; critical health pulses, and the pulse is disabled under `prefers-reduced-motion`.                                                                                                |

---

## The weapon rebuild

The guns were the most-looked-at object in the game and the least convincing.
The original viewmodels were **338-894 triangles each**, assembled from bare
`BoxGeometry` and `CylinderGeometry` with every surface meeting its neighbour at
a mathematically perfect 90 degrees, and every part sharing **one** metal
material.

Both halves of that matter, and neither is about polygon count:

- **No chamfers.** A real machined edge is a 0.3-1.5 mm fillet, and the specular
  highlight that rolls across that fillet _is_ how the eye recognises metal.
  With a perfectly sharp edge there is no geometry for the highlight to roll
  across, so it collapses into a hard line and the object reads as a CAD block.
- **One material.** At 0.4 m from the eye, material separation is the whole
  read. An anodised receiver, a phosphate barrel, a glass-filled nylon
  handguard and a rubber grip are four colours and four roughnesses. Sharing
  one albedo makes five parts into one grey object.

### What replaced it

`src/world/gunkit.js` — a hand-rolled hard-surface kit. Primitives: a swept
chamfered box (64 triangles, with a real band of intermediate normals rather
than one flat facet per corner), crowned tubes with a genuine inner bore, lathed
profiles, bevelled extrusions, MIL-STD-1913 Picatinny rail with the correct
21.2 mm / 15.7 mm / 10.55 mm pitch, M-LOK pockets, hex-socket screws, knurling
and serrations. Plus an `Assembly` that merges geometry per material, so a whole
rifle costs 4-7 draw calls.

`src/world/gunmaterials.js` — anodised aluminium, phosphate steel, glass-filled
nylon, rubber, bare wear metal, brass, optic glass and furniture, each with a
weapon-scale UV and its own roughness and metalness.

`src/world/guns/` — one builder per weapon, authored at real scale in metres
against real dimensions.

| Weapon | Before |  After | Draw calls |
| ------ | -----: | -----: | ---------: |
| MK18   |    670 | 23,600 |          6 |
| HK416  |    710 | 21,712 |          7 |
| MP7    |    618 | 14,592 |          5 |
| P226   |    338 | 14,322 |          4 |
| M249   |    822 | 17,512 |          6 |
| Kar98  |    894 | 20,572 |          4 |

Still procedural: no new art assets, no network at runtime, no new dependency.

### Bugs found by rasterising the result

No GPU in the build environment, so a CPU rasteriser was written that shades
each triangle with a two-light Lambert + specular model. It found four defects
that no amount of reading the code had caught:

- **Rings scattered across the front of the MK18.** `ringProfile()` returns a
  lathe about Z, which is already the suppressor's axis, so the band needed a
  plain translate. It also had a `rotateX(π/2)` applied _after_ the translate,
  which threw every ring end-on and sprayed them across the muzzle.
- **A slab of sleeve across the weapon.** Rotating the sleeve mesh by π about Y
  to reverse it also negated X, so the arm lay across the frame instead of
  running back toward the camera. Reversing Z alone (`scale.z = -1`) is the fix.
- **Floating cubes at the M249's muzzle and bipod.** The same translate-then-
  rotate ordering bug: a slot positioned on the muzzle circle and then rotated
  about the bore ends up wherever the rotation left it.
- **The Kar98's stock in pieces.** Ten separate boxes for the stock leave a
  visible gap wherever two segments disagree about width. Replaced with a single
  swept section that overlaps its neighbours.
- **An arm longer than the pistol it held.** One forearm length was used for
  every weapon. On a 196 mm pistol a 320 mm sleeve fills the frame; small
  weapons now get short arms.

### Contract kept

`WeaponController` reaches into the viewmodel by name every frame — `magPart`,
`boltPart`, `leftArm`, `muzzlePoint`, `ejectPoint`, `flashGroup`, `flashlight`,
`laserLine`, `laserDot`. All 14 required members are asserted for all six
weapons, and the magazine and bolt are now real geometry inside their pivot
groups rather than empty transforms, so `magPart.position.set(0, 0, 0)` means
"seated" and the reload's drop reads correctly.

Tests: 140 (was 119). New suites: `gunkit` (12) and `weapons` (9).

---

## Verified numbers (before → after)

| Metric                    | Original                   | Now                                             |
| ------------------------- | -------------------------- | ----------------------------------------------- |
| Source modules            | 1 file, 2,639 lines        | 19 modules, ~4.6k lines including docs-comments |
| Automated tests           | 0                          | 119 (unit + integration + server)               |
| Runtime errors at boot    | 1 (null viewmodel)         | 0                                               |
| Enemy AI raycasts / frame | 7                          | ~1 (throttled)                                  |
| DOM writes / frame (HUD)  | ~15                        | 0–3                                             |
| External network requests | 1 CDN (fatal when offline) | 0                                               |
