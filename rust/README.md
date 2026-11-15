# SECTOR-7 — Rust build

A complete first-person arena shooter. Everything — level, weapons, enemies,
HUD — is generated in code. No asset files.

## Controls

| | |
|---|---|
| `WASD` | move |
| `SHIFT` | sprint |
| `SPACE` | jump |
| mouse | look |
| `LMB` | fire |
| `RMB` | aim down sights (tightens spread, zooms) |
| `R` | reload |
| `1`–`6` | switch weapon |
| `ESC` | pause |

Six weapons, escalating waves, headshots count double.

## Build it yourself

Install Rust from <https://rustup.rs>, then:

```sh
cd rust
cargo run --release
```

The executable is written to `rust/target/release/sector7(.exe)`.

## Dependencies

One: [`macroquad`](https://github.com/not-fl3/macroquad), which handles the
window, input, 3D drawing and text. Everything else is `std`.
