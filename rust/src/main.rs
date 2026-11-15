//! SECTOR-7 entry point.
//!
//! A complete first-person arena shooter in pure Rust: hand-rolled Win32
//! window, hand-rolled software rasteriser, hand-rolled audio. No crates.

#![windows_subsystem = "windows"]

mod audio;
mod font;
mod gfx;
mod game;
mod math;
mod win;

use crate::game::*;
use crate::gfx::{Target, Tex};
use crate::win::*;
use std::time::Instant;

const SENS: f32 = 0.0023;

struct Keys {
    vk: [i32; K_COUNT],
}

fn key_table() -> Keys {
    Keys {
        vk: [
            0x57, // K_FWD    W
            0x53, // K_BACK   S
            0x41, // K_LEFT   A
            0x44, // K_RIGHT  D
            0x20, // K_JUMP   SPACE
            0x10, // K_SPRINT SHIFT
            0x52, // K_RELOAD R
            0x1B, // K_ESC
            0x0D, // K_ENTER
            0x31, // K_W1
            0x32, 0x33, 0x34, 0x35, 0x36, // K_W2..K_W6
            0xDB, // K_RESDOWN  [
            0xDD, // K_RESUP    ]
        ],
    }
}

fn main() {
    let mut win = match Window::new("SECTOR-7", 1280, 720) {
        Some(w) => w,
        None => return,
    };

    let mut game = Box::new(Game::new());
    let mut au = Box::new(audio::Audio::new());
    let texs: Vec<Tex> = gfx::make_textures();
    let keys = key_table();

    let mut target = {
        let (w, h) = game.internal_size(win.w, win.h);
        Target::new(w, h)
    };

    let mut inp = Input::new();
    let mut grabbed = false;
    let mut last = Instant::now();
    let mut last_step = 0.0f32;

    loop {
        let t0 = Instant::now();
        let dt = last.elapsed().as_secs_f32().min(0.05);
        last = t0;

        win.pump();
        if QUIT.load(std::sync::atomic::Ordering::Relaxed) {
            break;
        }

        // Resize the internal buffer when the window changes shape.
        let (iw, ih) = game.internal_size(win.w, win.h);
        if iw != target.w || ih != target.h {
            target.resize(iw, ih);
        }

        // --- keyboard -------------------------------------------------------
        inp.p.copy_from_slice(&inp.d);
        for i in 0..K_COUNT {
            inp.d[i] = unsafe { GetAsyncKeyState(keys.vk[i]) & 0x8000 != 0 };
        }

        // --- mouse ----------------------------------------------------------
        let want_grab = game.state == 1;
        if want_grab != grabbed {
            grabbed = want_grab;
            unsafe {
                ShowCursor(if grabbed { 0 } else { 1 });
            }
            if grabbed {
                win.confine_cursor();
            } else {
                win.release_cursor();
            }
        }
        let prev1 = inp.m1;
        inp.m1 = unsafe { GetAsyncKeyState(VK_LBUTTON) & 0x8000 != 0 };
        inp.m1p = inp.m1 && !prev1;
        inp.m2 = unsafe { GetAsyncKeyState(VK_RBUTTON) & 0x8000 != 0 };

        if grabbed {
            let cx = win.w / 2;
            let cy = win.h / 2;
            let mut pt = POINT { x: 0, y: 0 };
            unsafe {
                GetCursorPos(&mut pt);
            }
            inp.mdx = (pt.x - cx) as f32 * SENS;
            inp.mdy = (pt.y - cy) as f32 * SENS;
            unsafe {
                let mut scr = POINT { x: cx, y: cy };
                ClientToScreen(win.hwnd, &mut scr);
                SetCursorPos(scr.x, scr.y);
            }
        } else {
            inp.mdx = 0.0;
            inp.mdy = 0.0;
        }

        // --- state ----------------------------------------------------------
        match game.state {
            0 => {
                if inp.hit(K_ENTER) {
                    game.reset();
                    au.menu();
                }
            }
            2 => {
                if inp.hit(K_ESC) {
                    game.state = 1;
                }
                if inp.hit(K_ENTER) {
                    game.state = 0;
                    game.enemies.clear();
                    au.menu();
                }
            }
            3 => {
                if inp.hit(K_ENTER) {
                    game.reset();
                    au.menu();
                }
            }
            _ => {
                if inp.hit(K_ESC) {
                    game.state = 2;
                }
            }
        }

        if inp.hit(K_RESDOWN) {
            game.cycle_res(false);
        }
        if inp.hit(K_RESUP) {
            game.cycle_res(true);
        }

        // Footstep timing lives here so it survives weapon swaps.
        if game.state == 1 && game.grounded {
            let sp = (game.vel.x * game.vel.x + game.vel.z * game.vel.z).sqrt();
            if sp > 1.2 {
                last_step += dt * sp;
            }
        }

        game.update(dt, &inp, &mut au);
        au.update();

        // --- draw -----------------------------------------------------------
        if game.state == 0 {
            target.clear(0x00060a);
            game.draw_menu(&mut target);
        } else {
            game.render(&mut target, &texs);
            game.draw_hud(&mut target);
            if game.state == 2 {
                game.draw_paused(&mut target);
            }
            if game.state == 3 {
                game.draw_dead(&mut target);
            }
        }

        win.present(&target.buf, target.w, target.h);

        // Cap at 120 Hz so an idle menu does not spin the CPU.
        let el = t0.elapsed().as_secs_f32();
        let budget = 1.0 / 120.0;
        if el < budget {
            let ms = ((budget - el) * 1000.0) as u32;
            if ms > 0 {
                unsafe {
                    Sleep(ms);
                }
            }
        }
        let _ = last_step;
    }

    win.release_cursor();
    unsafe {
        ShowCursor(1);
    }
}
