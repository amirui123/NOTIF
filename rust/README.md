# SECTOR-7 — pure Rust, zero dependencies

A complete first-person arena shooter. **The dependency list is empty** — the
window, the 3D renderer, the audio and every texture are written by hand
against `std` and the Win32 API. That is why the whole game ships as a single
executable of roughly 150 KB.

## Controls

| | |
|---|---|
| `W A S D` | move |
| `SHIFT` | sprint |
| `SPACE` | jump (crates are also step-uppable) |
| mouse | look |
| `LMB` | fire |
| `RMB` | aim down sights (tightens spread, zooms, raises the optic) |
| `R` | reload |
| `1`–`6` | switch weapon |
| `[` `]` | internal resolution (270p … 720p) |
| `ESC` | pause |

Six weapons, escalating waves, headshots at double damage, a radar.

## What is hand-written

- **Windowing** — `RegisterClassW` / `CreateWindowExW` / `PeekMessageW`,
  imported directly from `user32`.
- **Presentation** — a `u32` framebuffer blitted with `StretchDIBits`.
- **Renderer** — perspective-correct textured triangles, a z-buffer,
  near-plane clipping, two-sided lighting, distance fog, procedural 64x64
  textures, sky gradient, vignette, ordered dither.
- **Audio** — `waveOut` streaming with a per-sample synthesiser: gunshots are
  filtered noise bursts with a low thump, hit markers are tones. No sound
  files.
- **Font** — a 5x7 bitmap font encoded as bit patterns in `font.rs`.

## Build it yourself

Install Rust from <https://rustup.rs>, then:

```sh
cd rust
cargo run --release
```

The binary lands at `rust/target/release/sector7.exe`.
