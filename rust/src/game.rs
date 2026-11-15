//! SECTOR-7 game logic and rendering.
//!
//! One module holds the level, the weapons, the enemies and every draw call.
//! The renderer is fed view-space triangles; building them here keeps the
//! rasteriser generic.

use crate::gfx::*;
use crate::math::*;

pub const EYE: f32 = 1.68;
pub const BODY_R: f32 = 0.36;
pub const HALF: f32 = 46.0;
const GRAVITY: f32 = 26.0;
const WALK: f32 = 7.0;
const SPRINT: f32 = 11.6;
const ACCEL: f32 = 68.0;
const FRICTION: f32 = 10.0;
const JUMP: f32 = 8.2;
const FOV_HIP: f32 = 1.30;
const NEAR: f32 = 0.035;
const FAR: f32 = 260.0;

// --- input ------------------------------------------------------------------

pub const K_FWD: usize = 0;
pub const K_BACK: usize = 1;
pub const K_LEFT: usize = 2;
pub const K_RIGHT: usize = 3;
pub const K_JUMP: usize = 4;
pub const K_SPRINT: usize = 5;
pub const K_RELOAD: usize = 6;
pub const K_ESC: usize = 7;
pub const K_ENTER: usize = 8;
pub const K_W1: usize = 9; // .. K_W5 contiguous
pub const K_RESDOWN: usize = 15;
pub const K_RESUP: usize = 16;
pub const K_COUNT: usize = 17;

pub struct Input {
    pub d: [bool; K_COUNT],
    pub p: [bool; K_COUNT],
    pub m1: bool,
    pub m2: bool,
    pub m1p: bool,
    pub mdx: f32,
    pub mdy: f32,
}

impl Input {
    pub fn new() -> Input {
        Input {
            d: [false; K_COUNT],
            p: [false; K_COUNT],
            m1: false,
            m2: false,
            m1p: false,
            mdx: 0.0,
            mdy: 0.0,
        }
    }
    #[inline(always)]
    pub fn down(&self, k: usize) -> bool {
        self.d[k]
    }
    #[inline(always)]
    pub fn hit(&self, k: usize) -> bool {
        self.d[k] && !self.p[k]
    }
    pub fn swap_weapon(&self) -> Option<usize> {
        for i in 0..6 {
            if self.hit(K_W1 + i) {
                return Some(i);
            }
        }
        None
    }
}

// --- rng --------------------------------------------------------------------

pub struct Rng(u64);
impl Rng {
    pub fn new(s: u64) -> Rng {
        Rng(s | 1)
    }
    #[inline]
    fn u(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    pub fn f(&mut self) -> f32 {
        (self.u() >> 11) as f32 / (1u64 << 53) as f32
    }
    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.f()
    }
}

// --- level ------------------------------------------------------------------

pub struct BoxS {
    pub min: V3,
    pub max: V3,
    pub mat: i8,
    pub col: [f32; 3],
    pub uvs: f32,
}

fn box_a(cx: f32, cz: f32, sx: f32, sz: f32, y0: f32, h: f32, mat: i8, c: [f32; 3], u: f32) -> BoxS {
    BoxS {
        min: v3(cx - sx * 0.5, y0, cz - sz * 0.5),
        max: v3(cx + sx * 0.5, y0 + h, cz + sz * 0.5),
        mat,
        col: c,
        uvs: u,
    }
}

const CONC: [f32; 3] = [0.62, 0.63, 0.60];
const DARK: [f32; 3] = [0.40, 0.41, 0.42];
const RUST: [f32; 3] = [0.55, 0.40, 0.30];
const WALL_C: [f32; 3] = [0.54, 0.55, 0.56];

fn build_level(rng: &mut Rng) -> Vec<BoxS> {
    let mut w = Vec::new();
    let t = 2.0;
    let wall_h = 5.0;
    w.push(box_a(0.0, -HALF - t * 0.5, HALF * 2.0 + 4.0, t, 0.0, wall_h, MAT_CONCRETE, WALL_C, 0.35));
    w.push(box_a(0.0, HALF + t * 0.5, HALF * 2.0 + 4.0, t, 0.0, wall_h, MAT_CONCRETE, WALL_C, 0.35));
    w.push(box_a(-HALF - t * 0.5, 0.0, t, HALF * 2.0 + 4.0, 0.0, wall_h, MAT_CONCRETE, WALL_C, 0.35));
    w.push(box_a(HALF + t * 0.5, 0.0, t, HALF * 2.0 + 4.0, 0.0, wall_h, MAT_CONCRETE, WALL_C, 0.35));

    // Two raised platforms with ramps of steps.
    w.push(box_a(-26.0, -26.0, 13.0, 13.0, 0.0, 2.4, MAT_CONCRETE, DARK, 0.4));
    w.push(box_a(26.0, 26.0, 13.0, 13.0, 0.0, 2.4, MAT_CONCRETE, DARK, 0.4));
    for i in 0..5 {
        let h = 0.48 + i as f32 * 0.48;
        w.push(box_a(-26.0 + 7.0 + i as f32 * 0.9, -26.0, 0.9, 5.0, 0.0, h, MAT_METAL, DARK, 0.5));
        w.push(box_a(26.0 - 7.0 - i as f32 * 0.9, 26.0, 0.9, 5.0, 0.0, h, MAT_METAL, DARK, 0.5));
    }

    // Scattered cover, kept clear of the spawn circle.
    for _ in 0..54 {
        let cx = rng.range(-HALF + 5.0, HALF - 5.0);
        let cz = rng.range(-HALF + 5.0, HALF - 5.0);
        if cx * cx + cz * cz < 13.0 * 13.0 {
            continue;
        }
        if (cx - 26.0).abs() < 9.0 && (cz - 26.0).abs() < 9.0 {
            continue;
        }
        if (cx + 26.0).abs() < 9.0 && (cz + 26.0).abs() < 9.0 {
            continue;
        }
        let sx = rng.range(2.0, 6.5);
        let sz = rng.range(2.0, 6.5);
        let roll = rng.f();
        if roll < 0.34 {
            // Pillar: tall, thin, blocks sight lines.
            w.push(box_a(cx, cz, sx.min(3.2), sz.min(3.2), 0.0, rng.range(4.5, 8.0), MAT_CONCRETE, CONC, 0.45));
        } else if roll < 0.72 {
            // Crate: waist high, vaultable.
            w.push(box_a(cx, cz, sx, sz, 0.0, rng.range(1.2, 2.6), MAT_CRATE, [0.70, 0.62, 0.48], 0.55));
        } else {
            // Shipping container: long, rusty, climbable via crates.
            let long = rng.f() > 0.5;
            let (a, b) = if long { (rng.range(7.0, 13.0), 2.6) } else { (2.6, rng.range(7.0, 13.0)) };
            w.push(box_a(cx, cz, a, b, 0.0, 2.9, MAT_METAL, RUST, 0.30));
        }
    }

    // A few catwalks for silhouette against the sky.
    for k in 0..3 {
        let cx = -20.0 + k as f32 * 20.0;
        w.push(box_a(cx, 0.0, 1.2, 1.2, 0.0, 9.0, MAT_METAL, DARK, 0.6));
        w.push(box_a(cx + 6.0, 0.0, 1.2, 1.2, 0.0, 9.0, MAT_METAL, DARK, 0.6));
        w.push(box_a(cx + 3.0, 0.0, 7.2, 1.0, 5.2, 0.3, MAT_METAL, DARK, 0.8));
    }
    w
}

// --- weapons ----------------------------------------------------------------

#[derive(Clone, Copy)]
pub struct WShape {
    pub barrel: f32,   // length beyond the receiver, metres
    pub barrel_t: f32, // half thickness
    pub recv: f32,     // receiver length
    pub hg: f32,       // handguard length
    pub stock: u8,     // 0 none, 1 buffer tube, 2 full stock
    pub stock_len: f32,
    pub mag: u8, // 0 short, 1 rifle, 2 drum, 3 internal
    pub mag_len: f32,
    pub optic: u8, // 0 iron, 1 red dot, 2 scope
    pub optic_h: f32,
    pub col_b: [f32; 3], // body
    pub col_a: [f32; 3], // furniture
    pub thick: f32,
}

#[derive(Clone, Copy)]
pub struct Weapon {
    pub name: &'static str,
    pub dmg: f32,
    pub rpm: f32,
    pub mag: i32,
    pub reserve: i32,
    pub spread: f32,
    pub ads_spread: f32,
    pub recoil: f32,
    pub range: f32,
    pub auto: bool,
    pub reload: f32,
    pub ads_fov: f32,
    pub kick: f32,
    pub shape: WShape,
}

fn weapons() -> [Weapon; 6] {
    [
        Weapon {
            name: "MK18",
            dmg: 34.0,
            rpm: 800.0,
            mag: 30,
            reserve: 240,
            spread: 0.020,
            ads_spread: 0.004,
            recoil: 0.95,
            range: 90.0,
            auto: true,
            reload: 2.1,
            ads_fov: 0.94,
            kick: 1.0,
            shape: WShape {
                barrel: 0.26,
                barrel_t: 0.014,
                recv: 0.30,
                hg: 0.20,
                stock: 1,
                stock_len: 0.20,
                mag: 1,
                mag_len: 0.19,
                optic: 1,
                optic_h: 0.088,
                col_b: [0.30, 0.32, 0.35],
                col_a: [0.16, 0.17, 0.19],
                thick: 1.0,
            },
        },
        Weapon {
            name: "HK416",
            dmg: 31.0,
            rpm: 850.0,
            mag: 30,
            reserve: 240,
            spread: 0.023,
            ads_spread: 0.005,
            recoil: 0.86,
            range: 88.0,
            auto: true,
            reload: 2.2,
            ads_fov: 0.90,
            kick: 0.92,
            shape: WShape {
                barrel: 0.30,
                barrel_t: 0.014,
                recv: 0.32,
                hg: 0.24,
                stock: 2,
                stock_len: 0.26,
                mag: 1,
                mag_len: 0.19,
                optic: 1,
                optic_h: 0.090,
                col_b: [0.28, 0.30, 0.33],
                col_a: [0.15, 0.16, 0.18],
                thick: 1.0,
            },
        },
        Weapon {
            name: "KAR98",
            dmg: 110.0,
            rpm: 55.0,
            mag: 5,
            reserve: 70,
            spread: 0.010,
            ads_spread: 0.0006,
            recoil: 3.0,
            range: 220.0,
            auto: false,
            reload: 3.2,
            ads_fov: 0.40,
            kick: 2.6,
            shape: WShape {
                barrel: 0.42,
                barrel_t: 0.012,
                recv: 0.30,
                hg: 0.0,
                stock: 2,
                stock_len: 0.34,
                mag: 3,
                mag_len: 0.02,
                optic: 2,
                optic_h: 0.098,
                col_b: [0.30, 0.31, 0.33],
                col_a: [0.34, 0.24, 0.15],
                thick: 0.92,
            },
        },
        Weapon {
            name: "MP7",
            dmg: 22.0,
            rpm: 950.0,
            mag: 40,
            reserve: 320,
            spread: 0.029,
            ads_spread: 0.008,
            recoil: 0.58,
            range: 60.0,
            auto: true,
            reload: 1.8,
            ads_fov: 1.04,
            kick: 0.62,
            shape: WShape {
                barrel: 0.14,
                barrel_t: 0.012,
                recv: 0.24,
                hg: 0.12,
                stock: 1,
                stock_len: 0.14,
                mag: 0,
                mag_len: 0.13,
                optic: 1,
                optic_h: 0.082,
                col_b: [0.27, 0.29, 0.32],
                col_a: [0.15, 0.16, 0.18],
                thick: 0.88,
            },
        },
        Weapon {
            name: "M249",
            dmg: 30.0,
            rpm: 750.0,
            mag: 100,
            reserve: 300,
            spread: 0.038,
            ads_spread: 0.012,
            recoil: 1.10,
            range: 95.0,
            auto: true,
            reload: 5.0,
            ads_fov: 0.92,
            kick: 1.25,
            shape: WShape {
                barrel: 0.34,
                barrel_t: 0.016,
                recv: 0.40,
                hg: 0.22,
                stock: 2,
                stock_len: 0.24,
                mag: 2,
                mag_len: 0.20,
                optic: 0,
                optic_h: 0.075,
                col_b: [0.31, 0.32, 0.30],
                col_a: [0.16, 0.17, 0.16],
                thick: 1.15,
            },
        },
        Weapon {
            name: "P226",
            dmg: 42.0,
            rpm: 420.0,
            mag: 15,
            reserve: 135,
            spread: 0.025,
            ads_spread: 0.006,
            recoil: 1.30,
            range: 55.0,
            auto: false,
            reload: 1.6,
            ads_fov: 1.08,
            kick: 1.35,
            shape: WShape {
                barrel: 0.06,
                barrel_t: 0.014,
                recv: 0.20,
                hg: 0.0,
                stock: 0,
                stock_len: 0.0,
                mag: 0,
                mag_len: 0.11,
                optic: 0,
                optic_h: 0.052,
                col_b: [0.28, 0.29, 0.31],
                col_a: [0.12, 0.12, 0.13],
                thick: 1.0,
            },
        },
    ]
}

/// Build a weapon in gun-local space: the barrel points down -Z, the grip is
/// at the origin, +Y is up.
fn build_gun(s: &WShape, out: &mut Vec<Tri>) {
    let id = M4_ID;
    let t = s.thick;
    let bt = s.barrel_t;
    let body = s.col_b;
    let furn = s.col_a;
    let metal = MAT_METAL;
    let black = [0.10, 0.10, 0.11];

    let recv_front = -s.recv * 0.5;
    let recv_back = s.recv * 0.5;

    // Receiver.
    push_box(
        out,
        v3(-0.032 * t, -0.030, recv_front),
        v3(0.032 * t, 0.042, recv_back),
        &id,
        3.0,
        metal,
        body,
        0.0,
    );
    // Top rail.
    push_box(
        out,
        v3(-0.022 * t, 0.042, recv_front + 0.02),
        v3(0.022 * t, 0.052, recv_back - 0.02),
        &id,
        4.0,
        metal,
        black,
        0.0,
    );
    // Barrel.
    push_box(
        out,
        v3(-bt, 0.000, recv_front - s.barrel),
        v3(bt, bt * 2.0, recv_front),
        &id,
        3.0,
        metal,
        body,
        0.0,
    );
    // Handguard.
    if s.hg > 0.01 {
        push_box(
            out,
            v3(-0.030 * t, -0.020, recv_front - s.hg),
            v3(0.030 * t, 0.030, recv_front),
            &id,
            2.5,
            MAT_METAL,
            furn,
            0.0,
        );
        // Vent slots read as darker ribs.
        for i in 0..4 {
            let z = recv_front - s.hg * (0.18 + i as f32 * 0.19);
            push_box(
                out,
                v3(-0.031 * t, 0.006, z - 0.008),
                v3(0.031 * t, 0.026, z + 0.008),
                &id,
                3.0,
                metal,
                black,
                0.0,
            );
        }
    }
    // Front sight / gas block.
    push_box(
        out,
        v3(-0.014, bt * 2.0, recv_front - s.barrel + 0.02),
        v3(0.014, bt * 2.0 + 0.022, recv_front - s.barrel + 0.06),
        &id,
        3.0,
        metal,
        black,
        0.0,
    );

    // Stock.
    match s.stock {
        1 => {
            push_box(
                out,
                v3(-0.018, -0.014, recv_back),
                v3(0.018, 0.020, recv_back + s.stock_len),
                &id,
                3.0,
                metal,
                black,
                0.0,
            );
        }
        2 => {
            push_box(
                out,
                v3(-0.026 * t, -0.056, recv_back),
                v3(0.026 * t, 0.010, recv_back + s.stock_len * 0.55),
                &id,
                2.0,
                MAT_WOOD,
                furn,
                0.0,
            );
            push_box(
                out,
                v3(-0.030 * t, -0.086, recv_back + s.stock_len * 0.5),
                v3(0.030 * t, 0.014, recv_back + s.stock_len),
                &id,
                2.0,
                MAT_WOOD,
                furn,
                0.0,
            );
        }
        _ => {}
    }

    // Magazine.
    let mx = 0.020;
    let mz0 = recv_front + s.recv * 0.42;
    match s.mag {
        0 => push_box(
            out,
            v3(-mx, -0.030 - s.mag_len, mz0 - 0.052),
            v3(mx, -0.026, mz0 + 0.052),
            &id,
            3.0,
            metal,
            black,
            0.0,
        ),
        1 => push_box(
            out,
            v3(-mx, -0.030 - s.mag_len, mz0 - 0.060),
            v3(mx, -0.026, mz0 + 0.030),
            &id,
            3.0,
            metal,
            black,
            0.0,
        ),
        2 => {
            // Drum: a fat box, slightly wider than the gun.
            push_box(
                out,
                v3(-0.070, -0.030 - s.mag_len, mz0 - 0.090),
                v3(0.070, -0.026, mz0 + 0.060),
                &id,
                2.0,
                metal,
                black,
                0.0,
            );
        }
        _ => {}
    }

    // Pistol grip (raked) or rifle grip.
    let g = m4_trs(
        v3(0.0, -0.030, recv_back - 0.055),
        v3(-0.30, 0.0, 0.0),
        1.0,
    );
    push_box(
        out,
        v3(-0.020 * t, -0.115, -0.036),
        v3(0.020 * t, 0.004, 0.036),
        &g,
        3.0,
        MAT_METAL,
        furn,
        0.0,
    );

    // Foregrip / vertical grip for the long guns.
    if s.hg > 0.01 {
        let fg = m4_trs(v3(0.0, -0.020, recv_front - s.hg * 0.45), v3(0.0, 0.0, 0.0), 1.0);
        push_box(
            out,
            v3(-0.018, -0.085, -0.022),
            v3(0.018, 0.0, 0.022),
            &fg,
            3.0,
            MAT_METAL,
            furn,
            0.0,
        );
    }

    // Optic.
    match s.optic {
        1 => {
            let oy = 0.052;
            push_box(
                out,
                v3(-0.018, oy, -0.030),
                v3(0.018, oy + 0.030, 0.030),
                &id,
                3.0,
                metal,
                black,
                0.0,
            );
            // The lit reticle window.
            push_box(
                out,
                v3(-0.013, oy + 0.004, -0.034),
                v3(0.013, oy + 0.026, -0.028),
                &id,
                3.0,
                -1,
                [0.55, 0.05, 0.05],
                0.55,
            );
        }
        2 => {
            let oy = 0.054;
            push_box(
                out,
                v3(-0.024, oy, -0.055),
                v3(0.024, oy + 0.040, 0.055),
                &id,
                2.0,
                metal,
                black,
                0.0,
            );
            push_box(
                out,
                v3(-0.020, oy - 0.020, -0.060),
                v3(0.020, oy + 0.002, -0.030),
                &id,
                2.0,
                metal,
                black,
                0.0,
            );
            push_box(
                out,
                v3(-0.020, oy - 0.020, 0.030),
                v3(0.020, oy + 0.002, 0.060),
                &id,
                2.0,
                metal,
                black,
                0.0,
            );
        }
        _ => {
            // Iron sights: a rear notch and a front post.
            push_box(
                out,
                v3(-0.014, 0.052, recv_back - 0.06),
                v3(0.014, 0.070, recv_back - 0.03),
                &id,
                3.0,
                metal,
                black,
                0.0,
            );
            push_box(
                out,
                v3(-0.004, 0.052, recv_front - s.barrel + 0.03),
                v3(0.004, 0.074, recv_front - s.barrel + 0.05),
                &id,
                3.0,
                metal,
                black,
                0.0,
            );
        }
    }

    // Trigger guard.
    push_box(
        out,
        v3(-0.014, -0.044, mz0 - 0.004),
        v3(0.014, -0.030, mz0 + 0.040),
        &id,
        4.0,
        metal,
        body,
        0.0,
    );

    // Hands: two fists on the grip and the handguard.
    let skin = [0.44, 0.33, 0.27];
    let glove = [0.13, 0.14, 0.16];
    push_box(
        out,
        v3(-0.052, -0.118, recv_back - 0.105),
        v3(0.052, -0.020, recv_back - 0.010),
        &id,
        3.0,
        -1,
        glove,
        0.0,
    );
    push_box(
        out,
        v3(-0.030, -0.086, recv_back - 0.135),
        v3(0.030, -0.030, recv_back - 0.075),
        &id,
        3.0,
        -1,
        skin,
        0.0,
    );
    if s.hg > 0.01 {
        push_box(
            out,
            v3(-0.062, -0.070, recv_front - s.hg * 0.72),
            v3(0.062, -0.005, recv_front - s.hg * 0.16),
            &id,
            3.0,
            -1,
            glove,
            0.0,
        );
    } else if s.stock == 2 {
        push_box(
            out,
            v3(-0.058, -0.078, recv_front - 0.10),
            v3(0.058, -0.012, recv_front + 0.04),
            &id,
            3.0,
            -1,
            glove,
            0.0,
        );
    } else {
        push_box(
            out,
            v3(-0.050, -0.100, recv_back - 0.05),
            v3(0.050, -0.030, recv_back + 0.03),
            &id,
            3.0,
            -1,
            glove,
            0.0,
        );
    }
}

const M4_ID: M4 = M4 {
    m: [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ],
};

// --- enemies ----------------------------------------------------------------

pub struct Enemy {
    pub pos: V3,
    pub hp: f32,
    pub max_hp: f32,
    pub speed: f32,
    pub fire_cd: f32,
    pub flash: f32,
    pub wob: f32,
    pub dead: bool,
    pub yaw: f32,
}

impl Enemy {
    fn spawn(rng: &mut Rng, wave: i32) -> Enemy {
        let a = rng.f() * TAU;
        let d = rng.range(28.0, 48.0);
        let hp = 85.0 + wave as f32 * 15.0;
        Enemy {
            pos: v3(a.cos() * d, 0.0, a.sin() * d),
            hp,
            max_hp: hp,
            speed: 3.0 + (wave as f32 * 0.10).min(2.6),
            fire_cd: rng.range(0.5, 1.8),
            flash: 0.0,
            wob: rng.f() * TAU,
            dead: false,
            yaw: 0.0,
        }
    }
    fn body_box(&self) -> (V3, V3) {
        (
            v3(self.pos.x - 0.34, self.pos.y + 0.05, self.pos.z - 0.28),
            v3(self.pos.x + 0.34, self.pos.y + 1.48, self.pos.z + 0.28),
        )
    }
    fn head_box(&self) -> (V3, V3) {
        (
            v3(self.pos.x - 0.17, self.pos.y + 1.48, self.pos.z - 0.17),
            v3(self.pos.x + 0.17, self.pos.y + 1.80, self.pos.z + 0.17),
        )
    }
}

fn draw_enemy(out: &mut Vec<Tri>, e: &Enemy, vm: &M4) {
    let walk = (e.wob * 3.0).sin();
    let m = m4_mul(vm, &m4_trs(e.pos, v3(0.0, e.yaw, 0.0), 1.0));
    let armour: [f32; 3] = [0.34, 0.20, 0.19];
    let cloth: [f32; 3] = [0.20, 0.22, 0.20];
    let skin: [f32; 3] = [0.42, 0.31, 0.25];
    let gun: [f32; 3] = [0.12, 0.12, 0.13];
    let hit_mix = e.flash;
    let tint = |c: [f32; 3]| -> [f32; 3] {
        [
            c[0] + hit_mix * 0.9,
            c[1] + hit_mix * 0.25,
            c[2] + hit_mix * 0.25,
        ]
    };

    // Legs swing with the walk cycle.
    let lz = walk * 0.22;
    push_box(out, v3(-0.20, 0.0, -0.14 + lz), v3(-0.05, 0.85, 0.14 + lz), &m, 2.0, MAT_ENEMY, tint(cloth), 0.0);
    push_box(out, v3(0.05, 0.0, -0.14 - lz), v3(0.20, 0.85, 0.14 - lz), &m, 2.0, MAT_ENEMY, tint(cloth), 0.0);
    // Boots.
    push_box(out, v3(-0.21, 0.0, -0.06 + lz), v3(-0.04, 0.14, 0.22 + lz), &m, 3.0, -1, [0.10, 0.10, 0.11], 0.0);
    push_box(out, v3(0.04, 0.0, -0.06 - lz), v3(0.21, 0.14, 0.22 - lz), &m, 3.0, -1, [0.10, 0.10, 0.11], 0.0);
    // Torso and shoulders.
    push_box(out, v3(-0.30, 0.80, -0.20), v3(0.30, 1.42, 0.20), &m, 2.0, MAT_ENEMY, tint(armour), 0.0);
    push_box(out, v3(-0.40, 1.16, -0.20), v3(-0.26, 1.44, 0.20), &m, 3.0, MAT_ENEMY, tint(armour), 0.0);
    push_box(out, v3(0.26, 1.16, -0.20), v3(0.40, 1.44, 0.20), &m, 3.0, MAT_ENEMY, tint(armour), 0.0);
    // Head.
    push_box(out, v3(-0.13, 1.45, -0.13), v3(0.13, 1.78, 0.13), &m, 2.5, -1, tint(skin), 0.0);
    // Helmet.
    push_box(out, v3(-0.15, 1.62, -0.15), v3(0.15, 1.80, 0.15), &m, 2.5, MAT_ENEMY, tint(armour), 0.0);
    // Visor slit.
    push_box(out, v3(-0.13, 1.54, -0.17), v3(0.13, 1.62, -0.13), &m, 3.0, -1, [0.05, 0.06, 0.08], 0.0);
    // Arms and weapon, held forward.
    push_box(out, v3(-0.42, 1.02, -0.30), v3(-0.24, 1.24, 0.06), &m, 3.0, -1, tint(cloth), 0.0);
    push_box(out, v3(0.24, 1.02, -0.30), v3(0.42, 1.24, 0.06), &m, 3.0, -1, tint(cloth), 0.0);
    push_box(out, v3(-0.10, 1.00, -0.52), v3(0.10, 1.16, 0.04), &m, 3.0, -1, gun, 0.0);
    push_box(out, v3(-0.03, 1.08, -0.86), v3(0.03, 1.14, -0.52), &m, 3.0, -1, gun, 0.0);
    // A faint emissive marker so hostiles read at distance.
    push_box(out, v3(-0.05, 1.40, -0.23), v3(0.05, 1.44, -0.19), &m, 3.0, -1, [0.9, 0.2, 0.15], 0.6);
}

// --- particles and tracers --------------------------------------------------

pub struct Particle {
    pub pos: V3,
    pub vel: V3,
    pub life: f32,
    pub max: f32,
    pub size: f32,
    pub col: [f32; 3],
    pub grav: f32,
    pub add: bool,
}

pub struct Tracer {
    pub a: V3,
    pub b: V3,
    pub life: f32,
}

// --- game -------------------------------------------------------------------

pub struct Game {
    pub rng: Rng,
    pub level: Vec<BoxS>,
    pub weapons: [Weapon; 6],
    pub slot: usize,
    pub mags: [i32; 6],
    pub res: [i32; 6],
    pub enemies: Vec<Enemy>,
    pub parts: Vec<Particle>,
    pub tracers: Vec<Tracer>,

    pub pos: V3,
    pub vel: V3,
    pub yaw: f32,
    pub pitch: f32,
    pub grounded: bool,
    pub hp: f32,
    pub state: u8, // 0 menu, 1 playing, 2 paused, 3 dead
    pub wave: i32,
    pub score: i32,
    pub kills: i32,
    pub between: f32,
    pub cd: f32,
    pub reloading: f32,
    pub ads: f32,
    pub res_mode: usize,

    pub bob: f32,
    pub step_phase: f32,
    pub recoil: f32,
    pub recoil_p: f32,
    pub muzzle: f32,
    pub hitmark: f32,
    pub hurt: f32,
    pub shake: f32,
    pub time: f32,
    pub fps: f32,
    pub best_wave: i32,
    pub best_score: i32,

    tris: Vec<Tri>,
    guns: [Vec<Tri>; 6],
}

const RES_HEIGHTS: [i32; 5] = [270, 360, 480, 540, 720];

impl Game {
    pub fn new() -> Game {
        let mut rng = Rng::new(0x5EC7_0F1D_9A7B_2211);
        let level = build_level(&mut rng);
        let w = weapons();
        let mut mags = [0i32; 6];
        let mut res = [0i32; 6];
        for i in 0..6 {
            mags[i] = w[i].mag;
            res[i] = w[i].reserve;
        }
        let guns: Vec<Vec<Tri>> = w.iter().map(|x| {
            let mut v = Vec::new();
            build_gun(&x.shape, &mut v);
            v
        }).collect();
        let guns: [Vec<Tri>; 6] = [
            guns[0].clone(),
            guns[1].clone(),
            guns[2].clone(),
            guns[3].clone(),
            guns[4].clone(),
            guns[5].clone(),
        ];
        Game {
            rng,
            level,
            weapons: w,
            slot: 0,
            mags,
            res,
            enemies: Vec::new(),
            parts: Vec::new(),
            tracers: Vec::new(),
            pos: v3(0.0, 0.0, 0.0),
            vel: v3(0.0, 0.0, 0.0),
            yaw: 0.0,
            pitch: 0.0,
            grounded: true,
            hp: 100.0,
            state: 0,
            wave: 0,
            score: 0,
            kills: 0,
            between: 0.0,
            cd: 0.0,
            reloading: 0.0,
            ads: 0.0,
            res_mode: 3,
            bob: 0.0,
            step_phase: 0.0,
            recoil: 0.0,
            recoil_p: 0.0,
            muzzle: 0.0,
            hitmark: 0.0,
            hurt: 0.0,
            shake: 0.0,
            time: 0.0,
            fps: 60.0,
            best_wave: 0,
            best_score: 0,
            tris: Vec::with_capacity(8192),
            guns,
        }
    }

    pub fn internal_size(&self, cw: i32, ch: i32) -> (i32, i32) {
        let target = RES_HEIGHTS[self.res_mode.min(4)];
        let h = target;
        let w = ((cw as f32 / ch as f32) * h as f32) as i32;
        (w.max(160), h.max(120))
    }

    pub fn cycle_res(&mut self, up: bool) {
        if up {
            self.res_mode = (self.res_mode + 1).min(4);
        } else {
            self.res_mode = self.res_mode.saturating_sub(1);
        }
    }

    pub fn weapon(&self) -> Weapon {
        self.weapons[self.slot]
    }

    pub fn reset(&mut self) {
        let w = weapons();
        self.weapons = w;
        for i in 0..6 {
            self.mags[i] = w[i].mag;
            self.res[i] = w[i].reserve;
        }
        self.slot = 0;
        self.pos = v3(0.0, 0.0, 0.0);
        self.vel = v3(0.0, 0.0, 0.0);
        self.yaw = 0.0;
        self.pitch = 0.0;
        self.hp = 100.0;
        self.enemies.clear();
        self.parts.clear();
        self.tracers.clear();
        self.wave = 0;
        self.score = 0;
        self.kills = 0;
        self.between = 1.5;
        self.reloading = 0.0;
        self.ads = 0.0;
        self.state = 1;
    }

    pub fn eye(&self) -> V3 {
        v3(self.pos.x, self.pos.y + EYE, self.pos.z)
    }

    pub fn aim(&self) -> V3 {
        let cp = self.pitch.cos();
        v3(-self.yaw.sin() * cp, self.pitch.sin(), -self.yaw.cos() * cp)
    }

    // -- collision -----------------------------------------------------------

    fn blocked(&self, p: V3, feet: f32, head: f32) -> bool {
        blocked_at(&self.level, p, feet, head)
    }
}

/// Player-vs-level overlap test. A free function so it can be called while
/// other fields of `Game` are mutably borrowed.
fn blocked_at(level: &[BoxS], p: V3, feet: f32, head: f32) -> bool {
    for b in level {
        if p.x + BODY_R > b.min.x
            && p.x - BODY_R < b.max.x
            && p.z + BODY_R > b.min.z
            && p.z - BODY_R < b.max.z
            && head > b.min.y
            && feet < b.max.y
        {
            return true;
        }
    }
    false
}

/// Height of the highest surface under (x, z) that is within a step of `from`.
fn ground_at(level: &[BoxS], x: f32, z: f32, from: f32) -> f32 {
    let mut h = 0.0f32;
    for b in level {
        if x + BODY_R > b.min.x
            && x - BODY_R < b.max.x
            && z + BODY_R > b.min.z
            && z - BODY_R < b.max.z
            && b.max.y > h
            && b.max.y <= from + 0.65
        {
            h = b.max.y;
        }
    }
    h
}

/// Enemies are wider than the player, so they get their own overlap test.
fn enemy_blocked(level: &[BoxS], p: V3) -> bool {
    for b in level {
        if p.x + 0.34 > b.min.x
            && p.x - 0.34 < b.max.x
            && p.z + 0.34 > b.min.z
            && p.z - 0.34 < b.max.z
            && p.y + 1.7 > b.min.y
            && p.y + 0.05 < b.max.y
        {
            return true;
        }
    }
    false
}

/// Stereo position of a world point heard from `pos` facing `yaw`.
fn pan_of(pos: V3, yaw: f32, p: V3) -> f32 {
    let d = p.sub(pos);
    let right = v3(yaw.cos(), 0.0, -yaw.sin());
    let fwd = v3(-yaw.sin(), 0.0, -yaw.cos());
    let l = d.len().max(0.001);
    (d.dot(right) / l).clamp(-1.0, 1.0) * (1.0 - (d.dot(fwd) / l).max(0.0) * 0.2)
}

/// Place the weapon in front of the camera. The gun model lives in its own
/// space; this builds the view-space transform and pushes the result.
fn push_vm(
    out: &mut Vec<Tri>,
    src: &[Tri],
    w: &Weapon,
    bob: f32,
    recoil: f32,
    ads: f32,
    vel: V3,
) {
    let s = &w.shape;

    // Hip: low and to the right, muzzle just under the crosshair.
    // ADS: pulled to the centre so the optic sits on the crosshair.
    let (hx, hy, hz) = (0.175, -0.190, -0.44);
    let (ax, ay, az) = (0.0, -s.optic_h, -0.30);

    let t = ads;
    let moving = v3(vel.x, 0.0, vel.z).len();
    let sprint = (moving - SPRINT + 1.0).clamp(0.0, 1.0) * (1.0 - t);

    let bobx = (bob * 1.0).sin() * 0.016 * (1.0 - t * 0.85);
    let boby = (bob * 2.0).sin() * 0.012 * (1.0 - t * 0.85);
    let sway = clamp(-vel.x * 0.004, -0.05, 0.05);

    let px = lerp(hx, ax, t) + bobx + sway + sprint * 0.10;
    let py = lerp(hy, ay, t) + boby + recoil * 0.012 - sprint * 0.10;
    let pz = lerp(hz, az, t) + recoil * 0.035 + sprint * 0.06;

    let rx = lerp(0.02, 0.0, t) - recoil * 0.10 - sprint * 0.35;
    let ry = lerp(0.13, 0.0, t) + sway * 1.5 + sprint * 0.45;
    let rz = lerp(-0.03, 0.0, t) + sprint * 0.30;

    let m = m4_trs(v3(px, py, pz), v3(rx, ry, rz), 1.0);
    for tri in src.iter() {
        out.push(Tri {
            p: [
                m4_xform(&m, tri.p[0]),
                m4_xform(&m, tri.p[1]),
                m4_xform(&m, tri.p[2]),
            ],
            n: [
                m4_dir(&m, tri.n[0]),
                m4_dir(&m, tri.n[1]),
                m4_dir(&m, tri.n[2]),
            ],
            uv: tri.uv,
            mat: tri.mat,
            col: tri.col,
            emis: tri.emis,
            add: false,
        });
    }
}

impl Game {
    fn ground_at(&self, x: f32, z: f32, from: f32) -> f32 {
        ground_at(&self.level, x, z, from)
    }


    fn move_player(&mut self, dt: f32, inp: &Input) {
        let f = v3(-self.yaw.sin(), 0.0, -self.yaw.cos());
        let r = v3(self.yaw.cos(), 0.0, -self.yaw.sin());
        let mut wish = v3(0.0, 0.0, 0.0);
        if inp.down(K_FWD) {
            wish = wish.add(f);
        }
        if inp.down(K_BACK) {
            wish = wish.sub(f);
        }
        if inp.down(K_RIGHT) {
            wish = wish.add(r);
        }
        if inp.down(K_LEFT) {
            wish = wish.sub(r);
        }
        let sprinting = inp.down(K_SPRINT) && inp.down(K_FWD) && self.ads < 0.25;
        let top = if sprinting { SPRINT } else { WALK } * (1.0 - self.ads * 0.35);
        if wish.len2() > 0.0 {
            wish = wish.norm().scale(top);
        }

        let mut hv = v3(self.vel.x, 0.0, self.vel.z);
        if wish.len2() > 0.0 {
            hv = hv.add(wish.sub(hv).scale((ACCEL * dt / top.max(1.0)).min(1.0)));
        } else {
            hv = hv.scale((1.0 - FRICTION * dt).max(0.0));
        }
        let sp = hv.len();
        if sp > top {
            hv = hv.scale(top / sp);
        }

        // Axis-separated resolution: slide along cover instead of sticking.
        let feet = self.pos.y + 0.12;
        let head = self.pos.y + EYE;
        let mut p = self.pos;
        let sx = v3(p.x + hv.x * dt, p.y, p.z);
        if !self.blocked(sx, feet, head) {
            p.x = sx.x;
        }
        let sz = v3(p.x, p.y, p.z + hv.z * dt);
        if !self.blocked(sz, feet, head) {
            p.z = sz.z;
        }
        self.vel = v3(hv.x, self.vel.y, hv.z);

        // Step up onto low ledges so crates are climbable without jumping.
        if (hv.x.abs() + hv.z.abs()) > 0.5 && self.grounded {
            let ahead = v3(
                p.x + hv.x * dt * 2.0,
                p.y,
                p.z + hv.z * dt * 2.0,
            );
            if self.blocked(ahead, self.pos.y + 0.12, self.pos.y + 0.30)
                && !self.blocked(ahead, self.pos.y + 0.62, self.pos.y + EYE)
            {
                p.y += 0.34;
            }
        }

        // Vertical.
        if self.grounded && inp.hit(K_JUMP) {
            self.vel.y = JUMP;
            self.grounded = false;
        }
        self.vel.y -= GRAVITY * dt;
        let ny = p.y + self.vel.y * dt;
        let floor = self.ground_at(p.x, p.z, p.y);
        if ny <= floor {
            p.y = floor;
            self.vel.y = 0.0;
            self.grounded = true;
        } else {
            p.y = ny;
            self.grounded = false;
            if self.blocked(p, p.y + 0.12, p.y + EYE) {
                p.y = ny - self.vel.y * dt;
                self.vel.y = 0.0;
            }
        }
        p.x = clamp(p.x, -HALF + BODY_R, HALF - BODY_R);
        p.z = clamp(p.z, -HALF + BODY_R, HALF - BODY_R);
        self.pos = p;

        // Head bob and footsteps, driven by ground speed.
        let gs = v3(self.vel.x, 0.0, self.vel.z).len();
        self.bob += dt * gs * 1.7;
        if self.grounded && gs > 1.2 {
            self.step_phase += dt * gs * 0.62;
        }
    }

    // -- combat --------------------------------------------------------------

    pub fn fire(&mut self, au: &mut crate::audio::Audio) {
        let w = self.weapon();
        if self.reloading > 0.0 || self.cd > 0.0 {
            return;
        }
        if self.mags[self.slot] <= 0 {
            self.cd = 0.25;
            au.dry();
            return;
        }
        self.mags[self.slot] -= 1;
        self.cd = 60.0 / w.rpm;
        self.recoil = w.recoil;
        self.recoil_p += w.recoil * 0.010;
        self.muzzle = 1.0;
        self.shake = (self.shake + w.recoil * 0.45).min(3.2);
        au.shot((0.45 + w.kick * 0.30).min(1.0));

        let spread = w.spread + (w.ads_spread - w.spread) * self.ads;
        let eye = self.eye();
        let base = self.aim();
        let up0 = v3(0.0, 1.0, 0.0);
        let mut side0 = base.cross(up0).norm();
        if side0.len2() < 1e-6 {
            side0 = v3(1.0, 0.0, 0.0);
        }
        let upv = side0.cross(base).norm();
        let dir = if spread > 0.0 {
            let a = self.rng.f() * TAU;
            let r = self.rng.f().sqrt() * spread;
            base.add(side0.scale(a.cos() * r)).add(upv.scale(a.sin() * r)).norm()
        } else {
            base
        };

        // Nearest hit wins; the level blocks shots, so cover matters.
        let mut best = w.range;
        let mut hit: Option<(usize, bool)> = None;
        for (i, e) in self.enemies.iter().enumerate() {
            if e.dead {
                continue;
            }
            let (mn, mx) = e.head_box();
            if let Some(t) = ray_box(eye, dir, mn, mx) {
                if t < best {
                    best = t;
                    hit = Some((i, true));
                }
            }
            let (mn, mx) = e.body_box();
            if let Some(t) = ray_box(eye, dir, mn, mx) {
                if t < best {
                    best = t;
                    hit = Some((i, false));
                }
            }
        }
        for b in &self.level {
            if let Some(t) = ray_box(eye, dir, b.min, b.max) {
                if t < best {
                    best = t;
                    hit = None;
                }
            }
        }

        let end = eye.add(dir.scale(best));
        self.tracers.push(Tracer { a: eye.add(dir.scale(0.6)).add(v3(0.0, -0.06, 0.0)), b: end, life: 0.075 });

        if let Some((i, head)) = hit {
            let dmg = if head { w.dmg * 2.0 } else { w.dmg };
            let pan = pan_of(self.pos, self.yaw, self.enemies[i].pos);
            let (dead, ex, ez) = {
                let e = &mut self.enemies[i];
                e.hp -= dmg;
                e.flash = 1.0;
                (e.hp <= 0.0, e.pos.x, e.pos.z)
            };
            self.hitmark = 1.0;
            self.score += if head { 30 } else { 12 };
            if head {
                au.headshot();
            } else {
                au.hit();
            }
            // Blood spray away from the impact.
            for _ in 0..8 {
                self.parts.push(Particle {
                    pos: end,
                    vel: v3(
                        self.rng.range(-1.6, 1.6) + dir.x * 2.0,
                        self.rng.range(0.6, 3.4),
                        self.rng.range(-1.6, 1.6) + dir.z * 2.0,
                    ),
                    life: 0.8,
                    max: 0.8,
                    size: 0.045,
                    col: [0.55, 0.06, 0.06],
                    grav: 9.0,
                    add: false,
                });
            }
            if dead {
                self.enemies[i].dead = true;
                self.kills += 1;
                self.score += 100;
                au.kill(pan);
                for _ in 0..16 {
                    self.parts.push(Particle {
                        pos: v3(ex, 1.0, ez),
                        vel: v3(self.rng.range(-2.6, 2.6), self.rng.range(1.0, 4.6), self.rng.range(-2.6, 2.6)),
                        life: 1.1,
                        max: 1.1,
                        size: 0.055,
                        col: [0.6, 0.07, 0.07],
                        grav: 8.0,
                        add: false,
                    });
                }
            }
        } else {
            // Impact sparks and dust on the wall.
            for _ in 0..6 {
                self.parts.push(Particle {
                    pos: end.sub(dir.scale(0.02)),
                    vel: v3(
                        self.rng.range(-2.2, 2.2) - dir.x * 1.5,
                        self.rng.range(0.2, 2.6),
                        self.rng.range(-2.2, 2.2) - dir.z * 1.5,
                    ),
                    life: 0.45,
                    max: 0.45,
                    size: 0.030,
                    col: [1.0, 0.75, 0.35],
                    grav: 11.0,
                    add: true,
                });
            }
        }

        // Recoil pushes the muzzle up and nudges the body back.
        self.pitch = clamp(self.pitch + w.recoil * 0.0075, -1.5, 1.5);
        self.yaw += self.rng.range(-1.0, 1.0) * w.recoil * 0.004;
        self.vel = self.vel.sub(self.aim().scale(w.kick * 0.35));
    }

    /// Stereo position of a world point, -1 left to +1 right.
    fn pan_of(&self, p: V3) -> f32 {
        pan_of(self.pos, self.yaw, p)
    }

    pub fn start_reload(&mut self, au: &mut crate::audio::Audio) {
        let i = self.slot;
        if self.reloading > 0.0 || self.mags[i] >= self.weapons[i].mag || self.res[i] <= 0 {
            return;
        }
        self.reloading = self.weapons[i].reload;
        au.reload();
    }

    fn update_enemies(&mut self, dt: f32, au: &mut crate::audio::Audio) {
        let pp = self.pos;
        for e in self.enemies.iter_mut() {
            if e.dead {
                continue;
            }
            e.flash = (e.flash - dt * 3.5).max(0.0);
            e.wob += dt * (2.0 + e.speed * 0.25);

            let to = v3(pp.x - e.pos.x, 0.0, pp.z - e.pos.z);
            let d = to.len().max(0.001);
            let dir = to.scale(1.0 / d);
            e.yaw = (-dir.x).atan2(-dir.z);

            if d > 8.5 {
                let step = e.speed * dt * (1.0 + 0.22 * (e.wob * 0.6).sin());
                let nx = e.pos.add(dir.scale(step));
                if !enemy_blocked(&self.level, nx) {
                    e.pos = nx;
                } else {
                    // Strafe around the obstacle instead of grinding on it.
                    let side = v3(-dir.z, 0.0, dir.x);
                    let sgn = if (e.wob as i32) & 1 == 0 { 1.0 } else { -1.0 };
                    let nx2 = e.pos.add(side.scale(step * sgn));
                    if !enemy_blocked(&self.level, nx2) {
                        e.pos = nx2;
                    } else {
                        let nx3 = e.pos.add(side.scale(-step * sgn));
                        if !enemy_blocked(&self.level, nx3) {
                            e.pos = nx3;
                        }
                    }
                }
            }

            e.fire_cd -= dt;
            if d < 38.0 && e.fire_cd <= 0.0 {
                e.fire_cd = 0.85 + self.rng.range(0.0, 1.1);
                if self.rng.f() > 0.42 {
                    let dmg = (1.0 - (d / 38.0).clamp(0.0, 1.0)) * 12.0 + 2.0;
                    self.hp -= dmg;
                    self.hurt = 1.0;
                    self.shake = (self.shake + 0.6).min(3.2);
                    au.enemy_shot(pan_of(self.pos, self.yaw, e.pos));
                }
                self.tracers.push(Tracer {
                    a: v3(e.pos.x, e.pos.y + 1.12, e.pos.z),
                    b: v3(pp.x, pp.y + EYE * 0.85, pp.z),
                    life: 0.09,
                });
            }

            // Keep them out of the geometry if they do clip in.
            let g = ground_at(&self.level, e.pos.x, e.pos.z, e.pos.y);
            e.pos.y = g;
        }
        self.enemies.retain(|e| !e.dead);
    }

    fn enemy_blocked(&self, p: V3) -> bool {
        for b in &self.level {
            if p.x + 0.34 > b.min.x
                && p.x - 0.34 < b.max.x
                && p.z + 0.34 > b.min.z
                && p.z - 0.34 < b.max.z
                && p.y + 1.7 > b.min.y
                && p.y + 0.05 < b.max.y
            {
                return true;
            }
        }
        false
    }

    fn update_waves(&mut self, dt: f32, au: &mut crate::audio::Audio) {
        if self.between > 0.0 {
            self.between -= dt;
            if self.between <= 0.0 {
                self.wave += 1;
                let count = 3 + self.wave * 2;
                for _ in 0..count {
                    let e = Enemy::spawn(&mut self.rng, self.wave);
                    if e.pos.sub(self.pos).len() > 18.0 {
                        self.enemies.push(e);
                    }
                }
                au.wave_start();
            }
            return;
        }
        if self.enemies.is_empty() {
            self.between = 4.5;
            self.hp = (self.hp + 30.0).min(100.0);
            if self.wave > self.best_wave {
                self.best_wave = self.wave;
            }
            if self.score > self.best_score {
                self.best_score = self.score;
            }
        }
    }

    pub fn update(&mut self, dt: f32, inp: &Input, au: &mut crate::audio::Audio) {
        self.time += dt;
        self.cd = (self.cd - dt).max(0.0);
        self.muzzle = (self.muzzle - dt * 11.0).max(0.0);
        self.hitmark = (self.hitmark - dt * 4.5).max(0.0);
        self.hurt = (self.hurt - dt * 1.7).max(0.0);
        self.shake = (self.shake - dt * 4.5).max(0.0);
        self.recoil *= (1.0 - dt * 7.0).max(0.0);
        self.recoil_p *= (1.0 - dt * 4.5).max(0.0);
        self.fps = self.fps * 0.92 + (1.0 / dt.max(0.0001)) * 0.08;

        for t in self.tracers.iter_mut() {
            t.life -= dt;
        }
        self.tracers.retain(|t| t.life > 0.0);
        for p in self.parts.iter_mut() {
            p.life -= dt;
            p.vel = p.vel.sub(v3(0.0, p.grav * dt, 0.0));
            p.pos = p.pos.add(p.vel.scale(dt));
            let g = ground_at(&self.level, p.pos.x, p.pos.z, p.pos.y);
            if p.pos.y < g + 0.01 {
                p.pos.y = g + 0.01;
                p.vel = v3(p.vel.x * 0.3, 0.0, p.vel.z * 0.3);
            }
        }
        self.parts.retain(|p| p.life > 0.0);

        if self.reloading > 0.0 {
            self.reloading -= dt;
            if self.reloading <= 0.0 {
                self.reloading = 0.0;
                let i = self.slot;
                let need = self.weapons[i].mag - self.mags[i];
                let take = need.min(self.res[i]);
                self.mags[i] += take;
                self.res[i] -= take;
                au.reload_done();
            }
        }

        if self.state != 1 {
            return;
        }

        // Look.
        self.yaw += inp.mdx;
        self.pitch = clamp(self.pitch - inp.mdy, -1.45, 1.45);

        let want_ads = if inp.m2 { 1.0 } else { 0.0 };
        self.ads += (want_ads - self.ads) * (dt * 13.0).min(1.0);

        if let Some(i) = inp.swap_weapon() {
            if i != self.slot {
                self.slot = i;
                self.reloading = 0.0;
                self.cd = 0.20;
                au.swap();
            }
        }

        let w = self.weapon();
        if w.auto {
            if inp.m1 {
                self.fire(au);
            }
        } else if inp.m1p {
            self.fire(au);
        }
        if inp.hit(K_RELOAD) {
            self.start_reload(au);
        }

        // Footstep audio driven by the bob phase.
        if self.grounded && v3(self.vel.x, 0.0, self.vel.z).len() > 1.2 {
            if self.step_phase.sin().abs() > 0.985 {
                au.footstep(self.rng.range(-0.25, 0.25));
            }
        }

        self.move_player(dt, inp);
        self.update_enemies(dt, au);
        self.update_waves(dt, au);

        if self.hp <= 0.0 {
            self.hp = 0.0;
            self.state = 3;
            if self.wave > self.best_wave {
                self.best_wave = self.wave;
            }
            if self.score > self.best_score {
                self.best_score = self.score;
            }
        }
    }

    // -- render --------------------------------------------------------------

    pub fn render(&mut self, t: &mut Target, texs: &[Tex]) {
        let (wf, hf) = (t.w as f32, t.h as f32);
        let fov = self.weapon().ads_fov * self.ads + FOV_HIP * (1.0 - self.ads);
        let pr = proj_new(fov, wf / hf, NEAR, FAR);

        // Camera shake and recoil compose into the view angles.
        let sh = self.shake;
        let (sx, sy) = if sh > 0.01 {
            (
                (self.time * 47.0).sin() * sh * 0.010,
                (self.time * 61.0).sin() * sh * 0.010,
            )
        } else {
            (0.0, 0.0)
        };
        let bobx = (self.bob * 1.0).sin() * 0.012 * (1.0 - self.ads * 0.8);
        let boby = (self.bob * 2.0).sin().abs() * 0.016 * (1.0 - self.ads * 0.8);
        let eye = v3(
            self.pos.x + bobx,
            self.pos.y + EYE + boby,
            self.pos.z,
        );
        let vm = m4_view(
            eye,
            self.yaw + sx,
            clamp(self.pitch + sy + self.recoil_p, -1.5, 1.5),
        );

        // --- sky ------------------------------------------------------------
        let horizon = 0.5 + (self.pitch / (fov * 0.5)) * 0.5;
        let sun = m4_dir(&vm, v3(-0.45, 0.55, 0.70).norm());
        let sun_x = (sun.x / sun.z.abs().max(0.15)) * 0.5;
        let sun_y = -(sun.y / sun.z.abs().max(0.15)) * 0.35;
        t.sky(
            horizon,
            [0.055, 0.075, 0.125],
            [0.30, 0.33, 0.38],
            sun_x * (if sun.z < 0.0 { 1.0 } else { -6.0 }),
            sun_y,
        );

        // --- world ----------------------------------------------------------
        self.tris.clear();
        let tan_x = (fov * 0.5).tan() * (wf / hf);
        for b in &self.level {
            let c = (b.min.add(b.max)).scale(0.5);
            let rad = (b.max.sub(b.min)).len() * 0.5;
            let vc = m4_xform(&vm, c);
            if vc.z - rad > -NEAR {
                continue; // entirely behind the camera
            }
            let dist = -vc.z;
            if dist - rad > FAR {
                continue;
            }
            if vc.x.abs() > rad + dist * tan_x + 2.0 {
                continue; // outside the horizontal frustum
            }
            push_box(&mut self.tris, b.min, b.max, &vm, b.uvs, b.mat, b.col, 0.0);
        }

        // Ground plane.
        push_quad(
            &mut self.tris,
            v3(-HALF, 0.0, -HALF),
            v3(HALF, 0.0, -HALF),
            v3(HALF, 0.0, HALF),
            v3(-HALF, 0.0, HALF),
            v3(0.0, 1.0, 0.0),
            &vm,
            0.5,
            MAT_TILE,
            [0.60, 0.60, 0.58],
        );

        for e in &self.enemies {
            let vc = m4_xform(&vm, e.pos.add(v3(0.0, 1.0, 0.0)));
            if vc.z > -NEAR || -vc.z > FAR {
                continue;
            }
            if vc.x.abs() > 1.6 + (-vc.z) * tan_x {
                continue;
            }
            draw_enemy(&mut self.tris, e, &vm);
        }

        for p in &self.parts {
            let s = p.size * (p.life / p.max).min(1.0).max(0.15);
            let vc = m4_xform(&vm, p.pos);
            if vc.z > -NEAR {
                continue;
            }
            push_box(
                &mut self.tris,
                p.pos.sub(v3(s, s, s)),
                p.pos.add(v3(s, s, s)),
                &vm,
                3.0,
                -1,
                p.col,
                if p.add { 0.9 } else { 0.15 },
            );
        }

        let key = m4_dir(&vm, v3(-0.45, 0.78, 0.44).norm());
        let light = Light {
            key,
            key_c: [0.78, 0.74, 0.64],
            sky: [0.30, 0.33, 0.40],
            ground: [0.11, 0.10, 0.09],
        };
        let fog = [0.30, 0.33, 0.38];
        t.clear_z();
        t.draw_tris(&self.tris, &pr, &light, &fog, 30.0, 165.0, texs);

        // --- viewmodel (own depth range, own light) --------------------------
        let wl = Light {
            key: v3(-0.55, 0.62, 0.56).norm(),
            key_c: [1.05, 1.00, 0.90],
            sky: [0.42, 0.45, 0.52],
            ground: [0.16, 0.15, 0.14],
        };
        let no_fog = [0.0, 0.0, 0.0];
        t.clear_z();
        self.tris.clear();
        {
            let w = self.weapon();
            let src = &self.guns[self.slot];
            let dst = &mut self.tris;
            push_vm(dst, src, &w, self.bob, self.recoil, self.ads, self.vel);
        }
        t.draw_tris(&self.tris, &pr, &wl, &no_fog, 1.0e9, 1.0e9 + 1.0, texs);

        // --- tracers and muzzle flash ---------------------------------------
        self.draw_effects(t, &pr, &vm);

        // --- post ------------------------------------------------------------
        t.vignette(0.55);
        t.dither();
        if self.hurt > 0.01 {
            t.wash(rgb(150, 20, 20), self.hurt * 0.32);
        }
        let low = 1.0 - (self.hp / 35.0).min(1.0);
        if low > 0.01 {
            t.wash(rgb(90, 0, 0), low * 0.22 * (0.6 + 0.4 * (self.time * 3.0).sin()));
        }
        if self.state == 3 {
            t.wash(rgb(40, 0, 0), 0.55);
        }
    }

}
    /// The muzzle in view space, so the flash lands at the end of the barrel.
    fn muzzle_view(&self) -> V3 {
        let w = self.weapon();
        let s = w.shape;
        let local = v3(0.0, s.barrel_t, -s.recv * 0.5 - s.barrel - 0.02);
        let t = self.ads;
        let (hx, hy, hz) = (0.175, -0.190, -0.44);
        let ax = 0.0;
        let ay = -s.optic_h;
        let az = -0.30;
        let px = lerp(hx, ax, t);
        let py = lerp(hy, ay, t) + self.recoil * 0.012;
        let pz = lerp(hz, az, t) + self.recoil * 0.035;
        let m = m4_trs(v3(px, py, pz), v3(lerp(0.02, 0.0, t), lerp(0.13, 0.0, t), lerp(-0.03, 0.0, t)), 1.0);
        m4_xform(&m, local)
    }

    fn draw_effects(&self, t: &mut Target, pr: &Proj, vm: &M4) {
        for tr in &self.tracers {
            let a = m4_xform(vm, tr.a);
            let b = m4_xform(vm, tr.b);
            if let (Some((ax, ay, _)), Some((bx, by, _))) =
                (t.project(pr, a), t.project(pr, b))
            {
                let f = (tr.life / 0.09).clamp(0.0, 1.0);
                t.line_a(ax, ay, bx, by, rgb(255, 235, 170), f * 0.85);
            }
        }
        if self.muzzle > 0.01 {
            let mv = self.muzzle_view();
            if let Some((x, y, _)) = t.project(pr, mv) {
                let k = self.muzzle;
                let r = (14.0 + k * 60.0) * (t.h as f32 / 540.0).max(0.6);
                t.glow(x, y, r, rgb(255, 190, 90), k * 0.85);
                t.glow(x, y, r * 0.45, rgb(255, 250, 220), k);
            }
        }
    }

    // -- HUD -----------------------------------------------------------------

    pub fn draw_hud(&self, t: &mut Target) {
        let w = t.w;
        let h = t.h;
        let sc = (h / 260).max(1).min(4);
        let cx = w / 2;
        let cy = h / 2;
        let wpn = self.weapon();

        // Crosshair: opens with movement, closes when aiming.
        let speed = v3(self.vel.x, 0.0, self.vel.z).len();
        let gap = ((h as f32 * 0.018) + speed * (h as f32 * 0.0042)) * (1.0 - self.ads * 0.70);
        let len = (h as f32 * 0.020).max(3.0);
        let cc = if self.hitmark > 0.01 {
            rgb(255, 90, 80)
        } else if self.ads > 0.6 && wpn.shape.optic == 0 {
            rgb(230, 240, 255)
        } else {
            rgb(215, 228, 245)
        };
        if self.ads < 0.55 || wpn.optic == 0 {
            t.rect((cx as f32 - gap - len) as i32, cy - 1, len as i32, 2, cc);
            t.rect((cx as f32 + gap) as i32, cy - 1, len as i32, 2, cc);
            t.rect(cx - 1, (cy as f32 - gap - len) as i32, 2, len as i32, cc);
            t.rect(cx - 1, (cy as f32 + gap) as i32, 2, len as i32, cc);
        }
        t.rect(cx - 1, cy - 1, 2, 2, cc);
        // Aiming reticles for the optical sights.
        if self.ads > 0.6 && wpn.shape.optic == 1 {
            t.circle(cx as f32, cy as f32, h as f32 * 0.055, rgb(20, 20, 20));
            t.glow(cx as f32, cy as f32, h as f32 * 0.010, rgb(255, 60, 50), 0.9);
        }

        // Health.
        let bw = (w as f32 * 0.26) as i32;
        let bx = 18;
        let by = h - 18 - sc * 8 - 4;
        t.rect_a(bx - 2, by - 2, bw + 4, sc * 8 + 4, rgb(0, 0, 0), 0.55);
        let hp = (self.hp / 100.0).clamp(0.0, 1.0);
        t.rect(bx, by, (bw as f32 * hp) as i32, sc * 8, rgb(190, 40, 35));
        t.rect(bx, by, bw, 1, rgb(90, 90, 95));
        t.rect(bx, by + sc * 8 - 1, bw, 1, rgb(90, 90, 95));
        t.text("HEALTH", bx, by - sc * 8 - 3, sc, rgb(150, 160, 175));

        // Ammo.
        let mag = self.mags[self.slot];
        let reserve = self.res[self.slot];
        let txt = if self.reloading > 0.0 {
            format!("RELOADING  {:.1}", self.reloading)
        } else {
            format!("{}  /  {}", mag, reserve)
        };
        let tw = crate::font::text_width(&txt, sc * 2);
        t.text_shadow(&txt, w - 18 - tw, h - 18 - sc * 20, sc * 2, if mag == 0 { rgb(255, 90, 80) } else { rgb(240, 244, 250) });
        t.text_shadow(wpn.name, w - 18 - crate::font::text_width(wpn.name, sc), h - 18 - sc * 34, sc, rgb(150, 168, 190));

        // Wave / score.
        t.text_c_shadow(&format!("WAVE {}", self.wave.max(1)), cx, 14, sc * 2, rgb(240, 244, 250));
        t.text_c_shadow(
            &format!("KILLS {}   SCORE {}", self.kills, self.score),
            cx,
            14 + sc * 16,
            sc,
            rgb(160, 172, 190),
        );
        if self.between > 0.0 {
            t.text_c_shadow(
                &format!("NEXT WAVE IN {:.1}", self.between),
                cx,
                (h as f32 * 0.30) as i32,
                sc * 2,
                rgb(255, 205, 90),
            );
        }

        // Weapon slots.
        let sy = h - 18 - sc * 46;
        for i in 0..6 {
            let x = 18 + i * (sc * 62 + 6);
            let on = i == self.slot;
            let c = if on { rgb(255, 205, 90) } else { rgb(120, 132, 148) };
            t.rect_a(x, sy, sc * 58, sc * 12, rgb(0, 0, 0), if on { 0.75 } else { 0.40 });
            t.text(&format!("{} {}", i + 1, self.weapons[i].name), x + sc * 2, sy + sc * 2, sc, c);
        }

        // Radar.
        self.draw_radar(t);

        // Perf readout, small and out of the way.
        let perf = format!("{} FPS   {}", self.fps as i32, RES_HEIGHTS[self.res_mode.min(4)]);
        t.text(&perf, w - 18 - crate::font::text_width(&perf, sc), 16, sc, rgb(110, 120, 135));
    }

    fn draw_radar(&self, t: &mut Target) {
        let w = t.w;
        let h = t.h;
        let r = (h as f32 * 0.13).min(w as f32 * 0.13);
        let cx = w as f32 - r - 16.0;
        let cy = r + 40.0;
        let range = 55.0f32;
        // Dish.
        for y in (-(r as i32))..=(r as i32) {
            for x in (-(r as i32))..=(r as i32) {
                let d2 = (x * x + y * y) as f32;
                if d2 > r * r {
                    continue;
                }
                let a = 0.42 - (d2 / (r * r)) * 0.16;
                t.blend(cx as i32 + x, cy as i32 + y, rgb(10, 14, 18), a);
            }
        }
        t.circle(cx, cy, r, rgb(70, 120, 95));
        // Sweep.
        let sw = (self.time * 1.6) % TAU;
        for i in 0..24 {
            let k = i as f32 / 24.0;
            let a = sw - k * 1.1;
            t.line(
                cx,
                cy,
                cx + a.cos() * r,
                cy + a.sin() * r,
                rgb(40, 110, 80),
            );
        }
        // Contacts: rotate world offsets into view space.
        let (sn, cs) = (self.yaw.sin(), self.yaw.cos());
        for e in &self.enemies {
            let dx = e.pos.x - self.pos.x;
            let dz = e.pos.z - self.pos.z;
            if dx * dx + dz * dz > range * range {
                continue;
            }
            // Forward is (-sin, -cos); right is (cos, -sin).
            let fwd = -dx * sn - dz * cs;
            let rgt = dx * cs - dz * sn;
            let px = cx + (rgt / range) * r;
            let py = cy - (fwd / range) * r;
            t.rect(px as i32 - 1, py as i32 - 1, 3, 3, rgb(240, 70, 60));
        }
        // The player, at the centre, pointing up.
        t.rect((cx as i32) - 1, (cy as i32) - 2, 3, 3, rgb(120, 240, 170));
    }

    pub fn draw_menu(&self, t: &mut Target) {
        let w = t.w;
        let h = t.h;
        let sc = (h / 240).max(1).min(5);
        t.wash(rgb(6, 8, 12), 0.92);
        let cx = w / 2;
        t.text_c_shadow("SECTOR-7", cx, (h as f32 * 0.16) as i32, sc * 4, rgb(255, 200, 70));
        t.text_c_shadow("ARENA OPS", cx, (h as f32 * 0.16) as i32 + sc * 34, sc * 2, rgb(150, 170, 200));
        t.text_c_shadow("PURE RUST  /  ZERO DEPENDENCIES", cx, (h as f32 * 0.16) as i32 + sc * 56, sc, rgb(110, 190, 150));

        t.text_c_shadow("PRESS ENTER TO DEPLOY", cx, (h as f32 * 0.52) as i32, sc * 2, rgb(240, 245, 255));

        let lines = [
            "WASD  MOVE      SHIFT  SPRINT     SPACE  JUMP",
            "MOUSE  LOOK     LMB  FIRE        RMB  AIM",
            "R  RELOAD       1-6  WEAPONS     ESC  PAUSE",
            "[ ]  RESOLUTION SCALE",
        ];
        for (i, l) in lines.iter().enumerate() {
            t.text_c_shadow(l, cx, (h as f32 * 0.66) as i32 + i as i32 * sc * 10, sc, rgb(140, 155, 175));
        }
        if self.best_score > 0 {
            t.text_c_shadow(
                &format!("BEST: WAVE {}   {} POINTS", self.best_wave.max(1), self.best_score),
                cx,
                (h as f32 * 0.88) as i32,
                sc,
                rgb(255, 200, 110),
            );
        }
    }

    pub fn draw_paused(&self, t: &mut Target) {
        let w = t.w;
        let h = t.h;
        let sc = (h / 260).max(1).min(4);
        t.wash(rgb(4, 6, 10), 0.68);
        let cx = w / 2;
        t.text_c_shadow("PAUSED", cx, (h as f32 * 0.38) as i32, sc * 4, rgb(240, 245, 255));
        t.text_c_shadow("ESC  RESUME", cx, (h as f32 * 0.52) as i32, sc * 2, rgb(160, 175, 195));
        t.text_c_shadow("ENTER  QUIT TO MENU", cx, (h as f32 * 0.52) as i32 + sc * 22, sc * 2, rgb(160, 175, 195));
    }

    pub fn draw_dead(&self, t: &mut Target) {
        let w = t.w;
        let h = t.h;
        let sc = (h / 260).max(1).min(4);
        t.wash(rgb(30, 0, 0), 0.5);
        let cx = w / 2;
        t.text_c_shadow("YOU WENT DOWN", cx, (h as f32 * 0.34) as i32, sc * 4, rgb(255, 90, 80));
        t.text_c_shadow(
            &format!("WAVE {}   {} KILLS   {} POINTS", self.wave.max(1), self.kills, self.score),
            cx,
            (h as f32 * 0.47) as i32,
            sc * 2,
            rgb(240, 245, 255),
        );
        t.text_c_shadow("PRESS ENTER TO REDEPLOY", cx, (h as f32 * 0.60) as i32, sc * 2, rgb(255, 205, 90));
    }
}
