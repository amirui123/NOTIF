//! SECTOR-7 — a complete first-person arena shooter.
//!
//! Everything here is generated in code: the level, the weapons, the enemies
//! and every pixel drawn. There are no asset files, so the whole game is this
//! one source file plus `macroquad`.

use macroquad::prelude::*;

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const EYE: f32 = 1.70;
const BODY_R: f32 = 0.38;
const GRAVITY: f32 = 26.0;
const WALK: f32 = 7.2;
const SPRINT: f32 = 12.0;
const ACCEL: f32 = 62.0;
const FRICTION: f32 = 11.0;
const JUMP: f32 = 8.4;
const FOV_HIP: f32 = 1.28;
const HALF: f32 = 48.0; // arena half-extent
const WALL_H: f32 = 4.5;
const MOUSE_SENS: f32 = 0.0022;

// ---------------------------------------------------------------------------
// Deterministic RNG (no dependency, no thread state to get wrong)
// ---------------------------------------------------------------------------

struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed | 1)
    }
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn f32(&mut self) -> f32 {
        (self.next_u64() >> 11) as f32 / (1u64 << 53) as f32
    }
    fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.f32()
    }
    fn pick(&mut self, n: usize) -> usize {
        (self.next_u64() % (n as u64).max(1)) as usize
    }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Wall {
    min: Vec3,
    max: Vec3,
    tint: f32,
    solid: bool,
}

impl Wall {
    fn box_around(cx: f32, cz: f32, sx: f32, sz: f32, h: f32, tint: f32) -> Self {
        Wall {
            min: vec3(cx - sx * 0.5, 0.0, cz - sz * 0.5),
            max: vec3(cx + sx * 0.5, h, cz + sz * 0.5),
            tint,
            solid: true,
        }
    }
    fn centre(&self) -> Vec3 {
        (self.min + self.max) * 0.5
    }
    fn size(&self) -> Vec3 {
        self.max - self.min
    }
}

fn axis(v: Vec3, i: usize) -> f32 {
    match i {
        0 => v.x,
        1 => v.y,
        _ => v.z,
    }
}

/// Slab test. Returns the distance along `dir` of the first hit, if any.
fn ray_aabb(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3) -> Option<f32> {
    let mut tmin = 0.0f32;
    let mut tmax = f32::MAX;
    for i in 0..3 {
        let o = axis(origin, i);
        let d = axis(dir, i);
        let lo = axis(min, i);
        let hi = axis(max, i);
        if d.abs() < 1e-9 {
            if o < lo || o > hi {
                return None;
            }
            continue;
        }
        let inv = 1.0 / d;
        let mut t1 = (lo - o) * inv;
        let mut t2 = (hi - o) * inv;
        if t1 > t2 {
            let t = t1;
            t1 = t2;
            t2 = t;
        }
        if t1 > tmin {
            tmin = t1;
        }
        if t2 < tmax {
            tmax = t2;
        }
        if tmin > tmax {
            return None;
        }
    }
    Some(tmin)
}

fn clamp(v: f32, lo: f32, hi: f32) -> f32 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Weapon {
    name: &'static str,
    damage: f32,
    rpm: f32,
    mag: i32,
    reserve: i32,
    spread: f32,
    ads_spread: f32,
    recoil: f32,
    range: f32,
    auto: bool,
    reload: f32,
    pellets: i32,
    ads_fov: f32,
    hue: Color,
}

fn weapons() -> [Weapon; 6] {
    [
        Weapon { name: "MK18",  damage: 34.0, rpm: 800.0, mag: 30, reserve: 210, spread: 0.021, ads_spread: 0.005, recoil: 0.95, range: 90.0, auto: true,  reload: 2.1, pellets: 1, ads_fov: 0.92, hue: Color::new(0.32, 0.34, 0.38, 1.0) },
        Weapon { name: "HK416", damage: 31.0, rpm: 850.0, mag: 30, reserve: 210, spread: 0.024, ads_spread: 0.006, recoil: 0.88, range: 88.0, auto: true,  reload: 2.2, pellets: 1, ads_fov: 0.88, hue: Color::new(0.30, 0.33, 0.36, 1.0) },
        Weapon { name: "KAR98", damage: 105.0, rpm: 55.0, mag: 5,  reserve: 60,  spread: 0.010, ads_spread: 0.0008, recoil: 3.10, range: 200.0, auto: false, reload: 3.4, pellets: 1, ads_fov: 0.42, hue: Color::new(0.42, 0.30, 0.20, 1.0) },
        Weapon { name: "MP7",   damage: 22.0, rpm: 950.0, mag: 40, reserve: 280, spread: 0.030, ads_spread: 0.009, recoil: 0.62, range: 60.0, auto: true,  reload: 1.8, pellets: 1, ads_fov: 1.02, hue: Color::new(0.28, 0.30, 0.34, 1.0) },
        Weapon { name: "M249",  damage: 30.0, rpm: 750.0, mag: 100, reserve: 300, spread: 0.040, ads_spread: 0.013, recoil: 1.15, range: 95.0, auto: true,  reload: 5.2, pellets: 1, ads_fov: 0.90, hue: Color::new(0.34, 0.34, 0.30, 1.0) },
        Weapon { name: "P226",  damage: 40.0, rpm: 400.0, mag: 15, reserve: 120, spread: 0.026, ads_spread: 0.007, recoil: 1.35, range: 55.0, auto: false, reload: 1.6, pellets: 1, ads_fov: 1.05, hue: Color::new(0.30, 0.31, 0.33, 1.0) },
    ]
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

struct Enemy {
    pos: Vec3,
    hp: f32,
    max_hp: f32,
    speed: f32,
    fire_cd: f32,
    hit_flash: f32,
    dead: bool,
    wobble: f32,
}

impl Enemy {
    fn spawn(rng: &mut Rng, wave: i32) -> Self {
        let hp = 80.0 + wave as f32 * 14.0;
        let angle = rng.f32() * std::f32::consts::TAU;
        let dist = rng.range(26.0, 46.0);
        Enemy {
            pos: vec3(angle.cos() * dist, 0.0, angle.sin() * dist),
            hp,
            max_hp: hp,
            speed: 3.1 + (wave as f32 * 0.09).min(2.4),
            fire_cd: rng.range(0.4, 1.6),
            hit_flash: 0.0,
            dead: false,
            wobble: rng.f32() * 6.28,
        }
    }
    fn head(&self) -> Vec3 {
        vec3(self.pos.x, self.pos.y + 1.62, self.pos.z)
    }
    fn body(&self) -> (Vec3, Vec3) {
        (
            vec3(self.pos.x - 0.42, self.pos.y + 0.10, self.pos.z - 0.34),
            vec3(self.pos.x + 0.42, self.pos.y + 1.55, self.pos.z + 0.34),
        )
    }
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

#[derive(PartialEq, Clone, Copy)]
enum State {
    Menu,
    Playing,
    Paused,
    Dead,
}

struct Game {
    rng: Rng,
    walls: Vec<Wall>,
    enemies: Vec<Enemy>,
    weapons: [Weapon; 6],
    slot: usize,
    mags: [i32; 6],
    reserves: [i32; 6],

    pos: Vec3,
    vel: Vec3,
    yaw: f32,
    pitch: f32,
    grounded: bool,
    hp: f32,

    state: State,
    wave: i32,
    score: i32,
    kills: i32,
    between: f32,
    cooldown: f32,
    reloading: f32,
    ads: f32,
    ammo_ads: f32,

    bob: f32,
    recoil_kick: f32,
    recoil_pitch: f32,
    muzzle: f32,
    hitmark: f32,
    damage_flash: f32,
    tracers: Vec<(Vec3, Vec3, f32)>,
    blood: Vec<(Vec3, f32)>,
    shake: f32,
    time: f32,
}

impl Game {
    fn new() -> Self {
        let mut rng = Rng::new(0x5EC7_0F1D_9A7B);
        let walls = build_level(&mut rng);
        let w = weapons();
        let mut mags = [0i32; 6];
        let mut reserves = [0i32; 6];
        for i in 0..6 {
            mags[i] = w[i].mag;
            reserves[i] = w[i].reserve;
        }
        Game {
            rng,
            walls,
            enemies: Vec::new(),
            weapons: w,
            slot: 0,
            mags,
            reserves,
            pos: vec3(0.0, 0.0, 0.0),
            vel: vec3(0.0, 0.0, 0.0),
            yaw: 0.0,
            pitch: 0.0,
            grounded: true,
            hp: 100.0,
            state: State::Menu,
            wave: 0,
            score: 0,
            kills: 0,
            between: 0.0,
            cooldown: 0.0,
            reloading: 0.0,
            ads: 0.0,
            ammo_ads: 0.0,
            bob: 0.0,
            recoil_kick: 0.0,
            recoil_pitch: 0.0,
            muzzle: 0.0,
            hitmark: 0.0,
            damage_flash: 0.0,
            tracers: Vec::new(),
            blood: Vec::new(),
            shake: 0.0,
            time: 0.0,
        }
    }

    fn weapon(&self) -> Weapon {
        self.weapons[self.slot]
    }

    fn reset(&mut self) {
        let w = weapons();
        self.weapons = w;
        self.slot = 0;
        for i in 0..6 {
            self.mags[i] = w[i].mag;
            self.reserves[i] = w[i].reserve;
        }
        self.pos = vec3(0.0, 0.0, 0.0);
        self.vel = vec3(0.0, 0.0, 0.0);
        self.yaw = 0.0;
        self.pitch = 0.0;
        self.hp = 100.0;
        self.enemies.clear();
        self.tracers.clear();
        self.blood.clear();
        self.wave = 0;
        self.score = 0;
        self.kills = 0;
        self.between = 1.2;
        self.state = State::Playing;
    }

    fn eye(&self) -> Vec3 {
        vec3(self.pos.x, self.pos.y + EYE, self.pos.z)
    }

    fn aim(&self) -> Vec3 {
        let cp = self.pitch.cos();
        vec3(self.yaw.cos() * cp, self.pitch.sin(), self.yaw.sin() * cp)
    }

    fn forward_flat(&self) -> Vec3 {
        vec3(self.yaw.cos(), 0.0, self.yaw.sin())
    }

    fn right_flat(&self) -> Vec3 {
        vec3(-self.yaw.sin(), 0.0, self.yaw.cos())
    }
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

fn build_level(rng: &mut Rng) -> Vec<Wall> {
    let mut w = Vec::new();
    // Perimeter.
    let t = 2.0;
    w.push(Wall::box_around(0.0, -HALF - t * 0.5, HALF * 2.0 + t * 2.0, t, WALL_H, 0.30));
    w.push(Wall::box_around(0.0, HALF + t * 0.5, HALF * 2.0 + t * 2.0, t, WALL_H, 0.30));
    w.push(Wall::box_around(-HALF - t * 0.5, 0.0, t, HALF * 2.0 + t * 2.0, WALL_H, 0.30));
    w.push(Wall::box_around(HALF + t * 0.5, 0.0, t, HALF * 2.0 + t * 2.0, WALL_H, 0.30));

    // Cover: crates and pillars, kept clear of the spawn.
    for _ in 0..46 {
        let cx = rng.range(-HALF + 6.0, HALF - 6.0);
        let cz = rng.range(-HALF + 6.0, HALF - 6.0);
        if cx * cx + cz * cz < 12.0 * 12.0 {
            continue;
        }
        let sx = rng.range(2.2, 6.5);
        let sz = rng.range(2.2, 6.5);
        let h = if rng.f32() < 0.35 {
            rng.range(4.6, 7.5) // pillar
        } else {
            rng.range(1.5, 3.0) // crate you can vault
        };
        w.push(Wall::box_around(cx, cz, sx, sz, h, rng.range(0.18, 0.42)));
    }
    // Two raised platforms for vertical play.
    w.push(Wall::box_around(-24.0, -24.0, 12.0, 12.0, 2.6, 0.50));
    w.push(Wall::box_around(24.0, 24.0, 12.0, 12.0, 2.6, 0.50));
    w
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

fn collides(p: Vec3, walls: &[Wall], feet: f32, head: f32) -> bool {
    for w in walls {
        if !w.solid {
            continue;
        }
        if p.x + BODY_R > w.min.x
            && p.x - BODY_R < w.max.x
            && p.z + BODY_R > w.min.z
            && p.z - BODY_R < w.max.z
            && head > w.min.y
            && feet < w.max.y
        {
            return true;
        }
    }
    false
}

fn ground_height(x: f32, z: f32, walls: &[Wall]) -> f32 {
    let mut h = 0.0f32;
    for w in walls {
        if !w.solid {
            continue;
        }
        if x + BODY_R > w.min.x
            && x - BODY_R < w.max.x
            && z + BODY_R > w.min.z
            && z - BODY_R < w.max.z
            && w.max.y <= h + 0.75
            && w.max.y > h
        {
            h = w.max.y;
        }
    }
    h
}

fn move_player(g: &mut Game, dt: f32) {
    let fwd = g.forward_flat();
    let right = g.right_flat();
    let mut wish = vec3(0.0, 0.0, 0.0);
    if is_key_down(KeyCode::W) {
        wish += fwd;
    }
    if is_key_down(KeyCode::S) {
        wish -= fwd;
    }
    if is_key_down(KeyCode::D) {
        wish += right;
    }
    if is_key_down(KeyCode::A) {
        wish -= right;
    }
    let sprinting = is_key_down(KeyCode::LeftShift) && is_key_down(KeyCode::W) && g.ads < 0.2;
    let target = if sprinting { SPRINT } else { WALK };
    if wish.length_squared() > 0.0 {
        wish = wish.normalize() * target;
    }

    // Horizontal acceleration + friction.
    let mut hv = vec3(g.vel.x, 0.0, g.vel.z);
    if wish.length_squared() > 0.0 {
        hv += wish * ACCEL * dt;
    }
    let damp = 1.0 - (FRICTION * dt).min(1.0);
    if wish.length_squared() < 0.001 {
        hv *= damp;
    }
    let sp = hv.length();
    if sp > target && wish.length_squared() > 0.0 {
        hv = hv.normalize() * (sp - (sp - target) * (ACCEL / 6.0) * dt * 0.2);
    }
    hv = if hv.length() > target * 1.9 {
        hv.normalize() * target * 1.9
    } else {
        hv
    };

    // Axis-separated resolution keeps the player sliding along walls.
    let feet = g.pos.y + 0.05;
    let head = g.pos.y + EYE;
    let mut p = g.pos;
    let step_x = vec3(p.x + hv.x * dt, p.y, p.z);
    if !collides(step_x, &g.walls, feet, head) {
        p.x = step_x.x;
    }
    let step_z = vec3(p.x, p.y, p.z + hv.z * dt);
    if !collides(step_z, &g.walls, feet, head) {
        p.z = step_z.z;
    }

    g.vel = vec3(hv.x, g.vel.y, hv.z);

    // Vertical.
    if g.grounded && is_key_pressed(KeyCode::Space) {
        g.vel.y = JUMP;
        g.grounded = false;
    }
    g.vel.y -= GRAVITY * dt;
    let ny = p.y + g.vel.y * dt;
    let floor = ground_height(p.x, p.z, &g.walls);
    if ny <= floor {
        p.y = floor;
        g.vel.y = 0.0;
        g.grounded = true;
    } else {
        p.y = ny;
        if collides(vec3(p.x, p.y, p.z), &g.walls, p.y + 0.05, p.y + EYE) {
            p.y = ny - g.vel.y * dt;
            g.vel.y = 0.0;
        }
    }
    p.x = clamp(p.x, -HALF, HALF);
    p.z = clamp(p.z, -HALF, HALF);
    g.pos = p;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

fn fire(g: &mut Game) {
    let w = g.weapon();
    if g.mags[g.slot] <= 0 || g.reloading > 0.0 || g.cooldown > 0.0 {
        return;
    }
    g.mags[g.slot] -= 1;
    g.cooldown = 60.0 / w.rpm;
    g.recoil_kick = w.recoil;
    g.recoil_pitch += w.recoil * 0.006;
    g.muzzle = 1.0;
    g.shake = (g.shake + w.recoil * 0.5).min(3.0);

    let spread = w.spread + (w.ads_spread - w.spread) * g.ads;
    let eye = g.eye();
    let base = g.aim();

    for _ in 0..w.pellets {
        let d = if spread > 0.0 {
            let a = g.rng.f32() * std::f32::consts::TAU;
            let r = g.rng.f32().sqrt() * spread;
            let up = vec3(0.0, 1.0, 0.0);
            let side = base.cross(up).normalize();
            let up2 = side.cross(base).normalize();
            (base + side * (a.cos() * r) + up2 * (a.sin() * r)).normalize()
        } else {
            base
        };

        let mut best = w.range;
        let mut hit_idx: Option<usize> = None;
        for (i, e) in g.enemies.iter().enumerate() {
            if e.dead {
                continue;
            }
            let (mn, mx) = e.body();
            if let Some(t) = ray_aabb(eye, d, mn, mx) {
                if t < best {
                    best = t;
                    hit_idx = Some(i);
                }
            }
        }
        for wall in &g.walls {
            if !wall.solid {
                continue;
            }
            if let Some(t) = ray_aabb(eye, d, wall.min, wall.max) {
                if t < best {
                    best = t;
                    hit_idx = None;
                }
            }
        }

        let end = eye + d * best;
        g.tracers.push((eye, end, 0.09));

        if let Some(i) = hit_idx {
            // Head hits count double.
            let e = &g.enemies[i];
            let (mn, mx) = e.body();
            let head_min = vec3(mn.x, mx.y - 0.34, mn.z);
            let is_head = ray_aabb(eye, d, head_min, mx).is_some();
            let dmg = if is_head { w.damage * 2.0 } else { w.damage };
            let dead = {
                let e = &mut g.enemies[i];
                e.hp -= dmg;
                e.hit_flash = 1.0;
                e.hp <= 0.0
            };
            g.hitmark = 1.0;
            g.score += if is_head { 25 } else { 10 };
            g.blood.push((end, 0.5));
            if dead {
                g.enemies[i].dead = true;
                g.kills += 1;
                g.score += 100;
            }
        }
    }
    g.vel -= g.aim() * w.recoil * 0.35;
}

fn reload(g: &mut Game) {
    let i = g.slot;
    if g.reloading > 0.0 || g.mags[i] >= g.weapons[i].mag {
        return;
    }
    if g.reserves[i] <= 0 {
        return;
    }
    g.reloading = g.weapons[i].reload;
}

fn update_enemies(g: &mut Game, dt: f32) {
    let player = g.pos;
    for e in g.enemies.iter_mut() {
        if e.dead {
            continue;
        }
        e.hit_flash = (e.hit_flash - dt * 3.0).max(0.0);
        e.wobble += dt * 2.0;

        let to = vec3(player.x - e.pos.x, 0.0, player.z - e.pos.z);
        let dist = to.length();
        let dir = if dist > 0.001 {
            to / dist
        } else {
            vec3(0.0, 0.0, 1.0)
        };

        // Stop at talking distance and trade shots.
        if dist > 9.0 {
            let step = e.speed * dt * (1.0 + 0.25 * (e.wobble * 0.7).sin());
            let nx = e.pos + dir * step;
            if !collides(nx, &g.walls, nx.y + 0.1, nx.y + 1.7) {
                e.pos = nx;
            } else {
                // Slide around the obstacle instead of grinding into it.
                let side = vec3(-dir.z, 0.0, dir.x);
                let nx2 = e.pos + side * step;
                if !collides(nx2, &g.walls, nx2.y + 0.1, nx2.y + 1.7) {
                    e.pos = nx2;
                }
            }
        }

        e.fire_cd -= dt;
        if dist < 34.0 && e.fire_cd <= 0.0 {
            e.fire_cd = 0.75 + g.rng.range(0.0, 0.9);
            // Suppression: chip damage that scales with how close they are.
            let dmg = (1.0 - (dist / 34.0).clamp(0.0, 1.0)) * 13.0 + 2.0;
            if g.rng.f32() > 0.45 {
                g.hp -= dmg;
                g.damage_flash = 1.0;
                g.shake = (g.shake + 0.7).min(3.0);
            }
        }
    }
    g.enemies.retain(|e| !e.dead);
}

fn update_waves(g: &mut Game, dt: f32) {
    if g.between > 0.0 {
        g.between -= dt;
        if g.between <= 0.0 {
            g.wave += 1;
            let count = 3 + g.wave * 2;
            for _ in 0..count {
                let e = Enemy::spawn(&mut g.rng, g.wave);
                if (e.pos - g.pos).length() > 18.0 {
                    g.enemies.push(e);
                }
            }
        }
        return;
    }
    if g.enemies.is_empty() {
        g.between = 4.0;
        g.hp = (g.hp + 25.0).min(100.0);
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

fn tint(base: f32) -> Color {
    Color::new(base * 0.9, base * 0.92, base, 1.0)
}

fn draw_world(g: &Game) {
    // Floor.
    draw_cube(
        vec3(0.0, -0.5, 0.0),
        vec3(HALF * 2.0, 1.0, HALF * 2.0),
        None,
        Color::new(0.16, 0.17, 0.15, 1.0),
    );
    draw_grid(24, 4.0, Color::new(0.22, 0.24, 0.22, 1.0), Color::new(0.20, 0.22, 0.20, 1.0));

    for w in &g.walls {
        draw_cube(w.centre(), w.size(), None, tint(w.tint));
        draw_cube_wires(w.centre(), w.size() * 1.001, Color::new(0.05, 0.06, 0.05, 1.0));
    }

    for e in &g.enemies {
        if e.dead {
            continue;
        }
        let flash = e.hit_flash;
        let c = Color::new(
            0.62 + flash * 0.38,
            0.18 + flash * 0.25,
            0.16 + flash * 0.25,
            1.0,
        );
        draw_cube(vec3(e.pos.x, e.pos.y + 0.78, e.pos.z), vec3(0.84, 1.36, 0.68), None, c);
        draw_cube(vec3(e.pos.x, e.pos.y + 1.68, e.pos.z), vec3(0.44, 0.44, 0.44), None, Color::new(0.78, 0.62, 0.48, 1.0));
        draw_cube(
            vec3(e.pos.x, e.pos.y + 1.05, e.pos.z + 0.45),
            vec3(0.9, 0.14, 0.5),
            None,
            Color::new(0.18, 0.19, 0.22, 1.0),
        );
        // Health pip above the head.
        let frac = (e.hp / e.max_hp).clamp(0.0, 1.0);
        if frac < 1.0 {
            draw_cube(
                vec3(e.pos.x, e.pos.y + 2.15, e.pos.z),
                vec3(0.9, 0.09, 0.09),
                None,
                Color::new(0.12, 0.12, 0.12, 1.0),
            );
            draw_cube(
                vec3(e.pos.x - (1.0 - frac) * 0.45, e.pos.y + 2.15, e.pos.z),
                vec3(0.9 * frac, 0.10, 0.10),
                None,
                Color::new(0.85, 0.20, 0.18, 1.0),
            );
        }
    }

    for (p, _life) in &g.blood {
        draw_cube(*p, vec3(0.22, 0.22, 0.22), None, Color::new(0.55, 0.08, 0.08, 0.9));
    }

    for (a, b, _life) in &g.tracers {
        draw_line_3d(*a, *b, Color::new(1.0, 0.88, 0.55, 0.9));
    }
}

/// The weapon, drawn in screen space. A viewmodel rendered in 3D would need a
/// second depth clear; drawing it in 2D is frame-perfect, always in front, and
/// costs three draw calls.
fn draw_viewmodel(g: &Game) {
    let sw = screen_width();
    let sh = screen_height();
    let w = g.weapon();

    let moving = vec3(g.vel.x, 0.0, g.vel.z).length();
    let bob_y = (g.bob * 9.0).sin() * (moving * 0.5).min(6.0);
    let bob_x = (g.bob * 4.5).sin() * (moving * 0.28).min(4.0);

    // ADS pulls the weapon to the centre; sprint pushes it down and out.
    let ads_t = g.ads;
    let sprint_t = if moving > SPRINT - 0.5 { 1.0 - ads_t } else { 0.0 };
    let base_x = sw * 0.68 + bob_x - ads_t * (sw * 0.18) + sprint_t * 40.0;
    let base_y = sh * 0.80 + bob_y - ads_t * (sh * 0.10) + sprint_t * 90.0
        + g.recoil_kick * 26.0;
    let scale = 1.0 - ads_t * 0.12;

    let dark = Color::new(0.09, 0.10, 0.12, 1.0);
    let body = w.hue;
    let metal = Color::new(body.r * 1.25, body.g * 1.25, body.b * 1.3, 1.0);

    let bw = 250.0 * scale;
    let bh = 34.0 * scale;

    // Stock / buffer tube.
    draw_rectangle(base_x - bw * 0.62, base_y + 6.0 * scale, bw * 0.34, bh * 0.62, dark);
    // Receiver.
    draw_rectangle(base_x - bw * 0.30, base_y - 4.0 * scale, bw * 0.62, bh, body);
    draw_rectangle(base_x - bw * 0.30, base_y - 4.0 * scale, bw * 0.62, bh * 0.22, metal);
    // Handguard + barrel.
    draw_rectangle(base_x + bw * 0.30, base_y + 2.0 * scale, bw * 0.46, bh * 0.55, dark);
    draw_rectangle(base_x + bw * 0.70, base_y + 6.0 * scale, bw * 0.30, bh * 0.34, metal);
    // Magazine.
    draw_rectangle(base_x - bw * 0.02, base_y + bh, bh * 1.5, bh * 2.3, dark);
    // Optic on the rail.
    draw_rectangle(base_x - bw * 0.10, base_y - 26.0 * scale, bw * 0.30, bh * 0.62, dark);
    draw_rectangle(base_x - bw * 0.06, base_y - 22.0 * scale, bw * 0.22, bh * 0.34, Color::new(0.35, 0.85, 0.95, 0.85));
    // Grip.
    draw_rectangle(base_x - bw * 0.20, base_y + bh, bh * 1.1, bh * 1.9, dark);

    if g.muzzle > 0.01 {
        let r = (10.0 + g.muzzle * 46.0) * scale;
        let mx = base_x + bw * 1.02;
        let my = base_y + 6.0 * scale + bh * 0.17;
        draw_circle(mx, my, r, Color::new(1.0, 0.85, 0.45, g.muzzle * 0.9));
        draw_circle(mx, my, r * 0.45, Color::new(1.0, 0.98, 0.85, g.muzzle));
    }
}

fn draw_hud(g: &Game) {
    let sw = screen_width();
    let sh = screen_height();
    let w = g.weapon();

    // Crosshair: opens with movement, tightens when aiming.
    let spread = (18.0 + vec3(g.vel.x, 0.0, g.vel.z).length() * 3.4) * (1.0 - g.ads * 0.72);
    let cx = sw * 0.5;
    let cy = sh * 0.5;
    let col = if g.hitmark > 0.01 {
        Color::new(1.0, 0.35, 0.3, 1.0)
    } else {
        Color::new(0.9, 0.95, 1.0, 0.85)
    };
    let len = 9.0;
    draw_line(cx - spread - len, cy, cx - spread, cy, 2.0, col);
    draw_line(cx + spread, cy, cx + spread + len, cy, 2.0, col);
    draw_line(cx, cy - spread - len, cx, cy - spread, 2.0, col);
    draw_line(cx, cy + spread, cx, cy + spread + len, 2.0, col);
    draw_circle(cx, cy, 1.6, col);

    // Health.
    let hp = (g.hp / 100.0).clamp(0.0, 1.0);
    draw_rectangle(28.0, sh - 74.0, 260.0, 22.0, Color::new(0.08, 0.09, 0.10, 0.75));
    draw_rectangle(30.0, sh - 72.0, 256.0 * hp, 18.0, Color::new(0.85, 0.20, 0.18, 1.0));
    draw_text(&format!("HP {}", g.hp.max(0.0) as i32), 30.0, sh - 80.0, 22.0, WHITE);

    // Ammo.
    let mag = g.mags[g.slot];
    let res = g.reserves[g.slot];
    let ammo = if g.reloading > 0.0 {
        format!("RELOADING {:.1}", g.reloading)
    } else {
        format!("{} / {}", mag, res)
    };
    draw_text(&ammo, sw - 260.0, sh - 48.0, 40.0, if mag == 0 { RED } else { WHITE });
    draw_text(w.name, sw - 260.0, sh - 78.0, 26.0, Color::new(0.75, 0.80, 0.88, 1.0));

    // Wave + score.
    draw_text(&format!("WAVE {}", g.wave.max(1)), sw * 0.5 - 60.0, 40.0, 30.0, WHITE);
    draw_text(
        &format!("KILLS {}   SCORE {}", g.kills, g.score),
        sw * 0.5 - 110.0,
        68.0,
        22.0,
        Color::new(0.7, 0.75, 0.85, 1.0),
    );
    if g.between > 0.0 {
        draw_text(
            &format!("NEXT WAVE IN {:.1}", g.between),
            sw * 0.5 - 130.0,
            sh * 0.36,
            32.0,
            Color::new(1.0, 0.85, 0.4, 1.0),
        );
    }

    // Weapon slots 1-6.
    for i in 0..6 {
        let x = 28.0 + i as f32 * 74.0;
        let y = sh - 132.0;
        let on = i == g.slot;
        draw_rectangle(x, y, 68.0, 26.0, Color::new(0.08, 0.09, 0.10, if on { 0.95 } else { 0.5 }));
        draw_text(
            &format!("{} {}", i + 1, g.weapons[i].name),
            x + 6.0,
            y + 19.0,
            16.0,
            if on { Color::new(1.0, 0.9, 0.5, 1.0) } else { Color::new(0.65, 0.7, 0.8, 1.0) },
        );
    }

    // Damage vignette.
    if g.damage_flash > 0.01 {
        let a = g.damage_flash * 0.55;
        let t = 90.0;
        draw_rectangle(0.0, 0.0, sw, t, Color::new(0.75, 0.05, 0.05, a));
        draw_rectangle(0.0, sh - t, sw, t, Color::new(0.75, 0.05, 0.05, a));
        draw_rectangle(0.0, 0.0, t, sh, Color::new(0.75, 0.05, 0.05, a));
        draw_rectangle(sw - t, 0.0, t, sh, Color::new(0.75, 0.05, 0.05, a));
    }
}

fn draw_menu(g: &Game) {
    let sw = screen_width();
    let sh = screen_height();
    draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.03, 0.04, 0.05, 1.0));
    draw_text("SECTOR-7", sw * 0.5 - 190.0, sh * 0.30, 78.0, Color::new(1.0, 0.82, 0.32, 1.0));
    draw_text("ARENA OPS // RUST BUILD", sw * 0.5 - 155.0, sh * 0.38, 26.0, Color::new(0.6, 0.68, 0.8, 1.0));
    draw_text("Press ENTER to deploy", sw * 0.5 - 145.0, sh * 0.54, 30.0, WHITE);
    draw_text("WASD move   SHIFT sprint   SPACE jump", sw * 0.5 - 195.0, sh * 0.64, 22.0, Color::new(0.55, 0.62, 0.72, 1.0));
    draw_text("LMB fire   RMB aim   R reload   1-6 weapons", sw * 0.5 - 215.0, sh * 0.69, 22.0, Color::new(0.55, 0.62, 0.72, 1.0));
    draw_text("ESC pause", sw * 0.5 - 60.0, sh * 0.74, 22.0, Color::new(0.55, 0.62, 0.72, 1.0));
    if g.kills > 0 || g.score > 0 {
        draw_text(
            &format!("Last run: wave {}   {} kills   {} points", g.wave.max(1), g.kills, g.score),
            sw * 0.5 - 190.0,
            sh * 0.84,
            24.0,
            Color::new(0.95, 0.75, 0.35, 1.0),
        );
    }
}

fn draw_dead(g: &Game) {
    let sw = screen_width();
    let sh = screen_height();
    draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.30, 0.03, 0.03, 0.72));
    draw_text("YOU WENT DOWN", sw * 0.5 - 215.0, sh * 0.42, 62.0, RED);
    draw_text(
        &format!("Wave {}   {} kills   {} points", g.wave.max(1), g.kills, g.score),
        sw * 0.5 - 175.0,
        sh * 0.52,
        30.0,
        WHITE,
    );
    draw_text("Press ENTER to redeploy", sw * 0.5 - 160.0, sh * 0.62, 28.0, Color::new(1.0, 0.9, 0.5, 1.0));
}

fn draw_paused() {
    let sw = screen_width();
    let sh = screen_height();
    draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.02, 0.03, 0.04, 0.72));
    draw_text("PAUSED", sw * 0.5 - 105.0, sh * 0.45, 62.0, WHITE);
    draw_text("ESC resume    ENTER quit to menu", sw * 0.5 - 175.0, sh * 0.55, 26.0, Color::new(0.7, 0.75, 0.85, 1.0));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn window_conf() -> Conf {
    Conf {
        window_title: "SECTOR-7".to_owned(),
        window_width: 1280,
        window_height: 720,
        high_dpi: true,
        sample_count: 4,
        ..Default::default()
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    let mut g = Game::new();

    loop {
        let dt = get_frame_time().min(0.05);
        g.time += dt;

        // ---- timers -------------------------------------------------------
        g.cooldown = (g.cooldown - dt).max(0.0);
        g.muzzle = (g.muzzle - dt * 9.0).max(0.0);
        g.hitmark = (g.hitmark - dt * 4.0).max(0.0);
        g.damage_flash = (g.damage_flash - dt * 1.8).max(0.0);
        g.shake = (g.shake - dt * 4.0).max(0.0);
        g.recoil_kick *= 1.0 - (dt * 8.0).min(1.0);
        g.recoil_pitch *= 1.0 - (dt * 5.0).min(1.0);
        g.bob += dt * vec3(g.vel.x, 0.0, g.vel.z).length();
        for t in g.tracers.iter_mut() {
            t.2 -= dt;
        }
        g.tracers.retain(|t| t.2 > 0.0);
        for b in g.blood.iter_mut() {
            b.1 -= dt;
        }
        g.blood.retain(|b| b.1 > 0.0);

        if g.reloading > 0.0 {
            g.reloading -= dt;
            if g.reloading <= 0.0 {
                g.reloading = 0.0;
                let i = g.slot;
                let need = g.weapons[i].mag - g.mags[i];
                let take = need.min(g.reserves[i]);
                g.mags[i] += take;
                g.reserves[i] -= take;
            }
        }

        // ---- state machine ------------------------------------------------
        match g.state {
            State::Menu => {
                show_mouse(true);
                set_cursor_grab(false);
                if is_key_pressed(KeyCode::Enter) || is_key_pressed(KeyCode::KpEnter) {
                    g.reset();
                    set_cursor_grab(true);
                    show_mouse(false);
                }
            }
            State::Dead => {
                show_mouse(true);
                set_cursor_grab(false);
                if is_key_pressed(KeyCode::Enter) || is_key_pressed(KeyCode::KpEnter) {
                    g.reset();
                    set_cursor_grab(true);
                    show_mouse(false);
                }
            }
            State::Paused => {
                if is_key_pressed(KeyCode::Escape) {
                    g.state = State::Playing;
                    set_cursor_grab(true);
                    show_mouse(false);
                }
                if is_key_pressed(KeyCode::Enter) || is_key_pressed(KeyCode::KpEnter) {
                    g.state = State::Menu;
                    g.enemies.clear();
                }
            }
            State::Playing => {
                if is_key_pressed(KeyCode::Escape) {
                    g.state = State::Paused;
                    set_cursor_grab(false);
                    show_mouse(true);
                }

                // Look.
                let md = mouse_delta_position();
                g.yaw += md.x * MOUSE_SENS;
                g.pitch = clamp(g.pitch - md.y * MOUSE_SENS, -1.5, 1.5);

                // Aim / sprint.
                let want_ads = is_mouse_button_down(MouseButton::Right) as i32 as f32;
                g.ads += (want_ads - g.ads) * (dt * 12.0).min(1.0);

                // Weapon switching.
                for i in 0..6 {
                    if is_key_pressed(
                        [KeyCode::Key1, KeyCode::Key2, KeyCode::Key3, KeyCode::Key4, KeyCode::Key5, KeyCode::Key6][i],
                    ) {
                        g.slot = i;
                        g.reloading = 0.0;
                    }
                }

                // Fire.
                let w = g.weapon();
                if w.auto {
                    if is_mouse_button_down(MouseButton::Left) {
                        fire(&mut g);
                    }
                } else if is_mouse_button_pressed(MouseButton::Left) {
                    fire(&mut g);
                }

                if is_key_pressed(KeyCode::R) {
                    reload(&mut g);
                }

                move_player(&mut g, dt);
                update_enemies(&mut g, dt);
                update_waves(&mut g, dt);

                if g.hp <= 0.0 {
                    g.hp = 0.0;
                    g.state = State::Dead;
                    set_cursor_grab(false);
                    show_mouse(true);
                }
            }
        }

        // ---- draw ---------------------------------------------------------
        clear_background(Color::new(0.06, 0.07, 0.09, 1.0));

        if g.state == State::Menu {
            draw_menu(&g);
            next_frame().await;
            continue;
        }

        let eye = g.eye();
        let aim = g.aim();
        let shake = g.shake;
        let sway = if shake > 0.01 {
            vec3(
                (g.time * 47.0).sin() * shake * 0.012,
                (g.time * 61.0).sin() * shake * 0.012,
                0.0,
            )
        } else {
            Vec3::ZERO
        };
        let fov = g.weapons[g.slot].ads_fov * g.ads + FOV_HIP * (1.0 - g.ads);
        let cam = Camera3D {
            position: eye + sway,
            target: eye + aim + sway,
            up: vec3(0.0, 1.0, 0.0),
            fovy: fov,
            ..Default::default()
        };
        set_camera(&cam);
        draw_world(&g);

        set_default_camera();
        draw_viewmodel(&g);
        draw_hud(&g);

        if g.state == State::Paused {
            draw_paused();
        }
        if g.state == State::Dead {
            draw_dead(&g);
        }

        next_frame().await;
    }
}
