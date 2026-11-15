//! A software rasteriser: z-buffered, textured, fogged triangles written
//! straight into a `u32` framebuffer, plus the 2D primitives the HUD needs.
//!
//! Everything is CPU work on purpose. There is no GPU dependency, no shader
//! compiler and no driver behaviour to work around.

use crate::font;
use crate::math::*;

#[inline(always)]
pub fn rgb(r: u32, g: u32, b: u32) -> u32 {
    (r << 16) | (g << 8) | b
}

#[inline(always)]
fn pack(r: f32, g: f32, b: f32) -> u32 {
    let ri = (clamp(r, 0.0, 1.0) * 255.0 + 0.5) as u32;
    let gi = (clamp(g, 0.0, 1.0) * 255.0 + 0.5) as u32;
    let bi = (clamp(b, 0.0, 1.0) * 255.0 + 0.5) as u32;
    rgb(ri, gi, bi)
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

pub const TS: usize = 64; // texture edge; must be a power of two
pub const TMASK: i32 = (TS - 1) as i32;

pub struct Tex {
    pub d: Vec<u32>,
}

pub const MAT_CONCRETE: i8 = 0;
pub const MAT_METAL: i8 = 1;
pub const MAT_WOOD: i8 = 2;
pub const MAT_CRATE: i8 = 3;
pub const MAT_TILE: i8 = 4;
pub const MAT_ENEMY: i8 = 5;

struct Noise(u64);
impl Noise {
    #[inline]
    fn next(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        (x >> 11) as f32 / (1u64 << 53) as f32
    }
}

/// Smooth, tileable value noise on a lattice of at most 16x16 cells.
fn value_noise(seed: u64, cells: i32) -> [f32; TS * TS] {
    let c = cells.clamp(1, 16);
    let mut r = Noise(seed | 1);
    let mut grid = [0f32; 16 * 16];
    for g in grid.iter_mut() {
        *g = r.next();
    }
    let mut out = [0f32; TS * TS];
    for y in 0..TS {
        for x in 0..TS {
            let fx = x as f32 * c as f32 / TS as f32;
            let fy = y as f32 * c as f32 / TS as f32;
            let x0 = fx.floor() as i32;
            let y0 = fy.floor() as i32;
            let tx = fx - x0 as f32;
            let ty = fy - y0 as f32;
            let sx = tx * tx * (3.0 - 2.0 * tx);
            let sy = ty * ty * (3.0 - 2.0 * ty);
            let gx = |i: i32| ((i % c) + c) % c;
            let a = grid[(gx(x0) + gx(y0) * c) as usize];
            let b = grid[(gx(x0 + 1) + gx(y0) * c) as usize];
            let d = grid[(gx(x0) + gx(y0 + 1) * c) as usize];
            let e = grid[(gx(x0 + 1) + gx(y0 + 1) * c) as usize];
            out[y * TS + x] = lerp(lerp(a, b, sx), lerp(d, e, sx), sy);
        }
    }
    out
}

fn tex_concrete(seed: u64) -> Tex {
    let n1 = value_noise(seed, 8);
    let n2 = value_noise(seed ^ 0x9E37, 16);
    let mut r = Noise(seed ^ 0x55);
    let mut d = vec![0u32; TS * TS];
    for i in 0..TS * TS {
        let g = 0.34 + (n1[i] - 0.5) * 0.30 + (n2[i] - 0.5) * 0.10 + (r.next() - 0.5) * 0.04;
        let speck = if r.next() > 0.985 { 0.22 } else { 0.0 };
        let v = g + speck;
        d[i] = pack(v, v * 0.99, v * 0.94);
    }
    Tex { d }
}

fn tex_metal(seed: u64) -> Tex {
    let n = value_noise(seed, 12);
    let streak_src = value_noise(seed + 3, 16);
    let mut r = Noise(seed ^ 0x77);
    let mut d = vec![0u32; TS * TS];
    for y in 0..TS {
        for x in 0..TS {
            let i = y * TS + x;
            // Brushed streaks run along V: sample the noise column-wise.
            let col = (x as f32 * 4.0) as usize % TS;
            let streak = (streak_src[y * TS + col] - 0.5) * 0.26;
            let v = 0.30 + (n[i] - 0.5) * 0.16 + streak + (r.next() - 0.5) * 0.03;
            d[i] = pack(v * 0.96, v * 1.00, v * 1.10);
        }
    }
    Tex { d }
}

fn tex_wood(seed: u64) -> Tex {
    let n = value_noise(seed, 6);
    let mut r = Noise(seed ^ 0x31);
    let mut d = vec![0u32; TS * TS];
    for y in 0..TS {
        for x in 0..TS {
            let i = y * TS + x;
            let grain = ((x as f32 * 0.55 + n[i] * 9.0).sin() * 0.5 + 0.5).powf(2.2);
            let v = 0.20 + grain * 0.22 + (r.next() - 0.5) * 0.03;
            d[i] = pack(v * 1.20, v * 0.82, v * 0.52);
        }
    }
    Tex { d }
}

fn tex_crate(seed: u64) -> Tex {
    let n = value_noise(seed, 8);
    let mut r = Noise(seed ^ 0x13);
    let mut d = vec![0u32; TS * TS];
    for y in 0..TS {
        for x in 0..TS {
            let i = y * TS + x;
            let plank = (y / 16) % 2;
            let gap = (y % 16) < 1;
            let mut v = 0.26 + plank as f32 * 0.06 + (n[i] - 0.5) * 0.10 + (r.next() - 0.5) * 0.04;
            if gap {
                v *= 0.45;
            }
            if x < 3 || x > TS - 4 || y < 3 || y > TS - 4 {
                v *= 0.68;
            }
            d[i] = pack(v * 1.15, v * 0.92, v * 0.60);
        }
    }
    Tex { d }
}

fn tex_tile(seed: u64) -> Tex {
    let n = value_noise(seed, 16);
    let mut r = Noise(seed ^ 0x91);
    let mut d = vec![0u32; TS * TS];
    for y in 0..TS {
        for x in 0..TS {
            let i = y * TS + x;
            let grout = (x % 32) < 2 || (y % 32) < 2;
            let v = if grout {
                0.13
            } else {
                0.30 + (n[i] - 0.5) * 0.10 + (r.next() - 0.5) * 0.03
            };
            d[i] = pack(v * 0.94, v * 0.96, v);
        }
    }
    Tex { d }
}

fn tex_enemy(seed: u64) -> Tex {
    let n = value_noise(seed, 10);
    let mut r = Noise(seed ^ 0x2B);
    let mut d = vec![0u32; TS * TS];
    for y in 0..TS {
        for x in 0..TS {
            let i = y * TS + x;
            let panel = ((x % 21) < 2 || (y % 15) < 2) as i32 as f32;
            let v = 0.26 + (n[i] - 0.5) * 0.14 + (r.next() - 0.5) * 0.03 - panel * 0.10;
            d[i] = pack(v * 1.30, v * 0.62, v * 0.58);
        }
    }
    Tex { d }
}

pub fn make_textures() -> Vec<Tex> {
    vec![
        tex_concrete(11),
        tex_metal(22),
        tex_wood(33),
        tex_crate(44),
        tex_tile(55),
        tex_enemy(66),
    ]
}

// ---------------------------------------------------------------------------
// View-space triangles
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
pub struct Tri {
    pub p: [V3; 3],
    pub n: [V3; 3],
    pub uv: [[f32; 2]; 3],
    pub mat: i8,   // -1 = flat colour only
    pub col: [f32; 3],
    pub emis: f32, // added on top of the lighting
    pub add: bool, // additive blend, no depth write
}

pub struct Light {
    /// Direction *towards* the key light, in view space.
    pub key: V3,
    pub key_c: [f32; 3],
    pub sky: [f32; 3],
    pub ground: [f32; 3],
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/// Append the twelve triangles of an axis-aligned box.
/// `m` maps object space to view space, `uvs` is texture repeats per metre.
pub fn push_box(
    out: &mut Vec<Tri>,
    min: V3,
    max: V3,
    m: &M4,
    uvs: f32,
    mat: i8,
    col: [f32; 3],
    emis: f32,
) {
    // For each face: the four corners in order, the outward normal, and the
    // two object axes that map onto (u, v).
    let lo = [min.x, min.y, min.z];
    let hi = [max.x, max.y, max.z];

    for f in 0..6 {
        let axis_i = f / 2;
        let positive = (f & 1) == 1;
        let u_ax = (axis_i + 1) % 3;
        let v_ax = (axis_i + 2) % 3;

        // Four corners of the face, counter-clockwise seen from outside.
        let mut corners = [[0f32, 0f32, 0f32]; 4];
        let fixed = if positive { hi[axis_i] } else { lo[axis_i] };
        let signs: [[f32; 2]; 4] = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        for k in 0..4 {
            let su = lerp(lo[u_ax], hi[u_ax], signs[k][0]);
            let sv = lerp(lo[v_ax], hi[v_ax], signs[k][1]);
            let mut c = [0f32; 3];
            c[axis_i] = fixed;
            c[u_ax] = su;
            c[v_ax] = sv;
            corners[k] = c;
        }

        let mut nrm = [0f32; 3];
        nrm[axis_i] = if positive { 1.0 } else { -1.0 };

        let quad = [0usize, 1, 2, 0, 2, 3];
        let mut vs = [V3 { x: 0.0, y: 0.0, z: 0.0 }; 3];
        let mut uvs_out = [[0f32; 2]; 3];
        for tri in 0..2 {
            for k in 0..3 {
                let c = corners[quad[tri * 3 + k]];
                let p = v3(c[0], c[1], c[2]);
                vs[k] = m4_xform(m, p);
                uvs_out[k] = [c[u_ax] * uvs, c[v_ax] * uvs];
            }
            out.push(Tri {
                p: vs,
                n: [m4_dir(m, v3(nrm[0], nrm[1], nrm[2])); 3],
                uv: uvs_out,
                mat,
                col,
                emis,
                add: false,
            });
        }
    }
}

/// A single one-sided quad, used for the ground plane where a box would waste
/// a full-screen back face.
pub fn push_quad(
    out: &mut Vec<Tri>,
    a: V3,
    b: V3,
    c: V3,
    d: V3,
    n: V3,
    m: &M4,
    uvs: f32,
    mat: i8,
    col: [f32; 3],
) {
    let pts = [a, b, c, a, c, d];
    let ns = m4_dir(m, n);
    for tri in 0..2 {
        let mut p = [V3 { x: 0.0, y: 0.0, z: 0.0 }; 3];
        let mut uv = [[0f32; 2]; 3];
        for k in 0..3 {
            let q = pts[tri * 3 + k];
            p[k] = m4_xform(m, q);
            uv[k] = [q.x * uvs, q.z * uvs];
        }
        out.push(Tri {
            p,
            n: [ns; 3],
            uv,
            mat,
            col,
            emis: 0.0,
            add: false,
        });
    }
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

/// One vertex in clip space carrying everything the interpolator needs.
#[derive(Clone, Copy, Default)]
struct Cv {
    x: f32,
    y: f32,
    z: f32,
    w: f32,
    u: f32,
    v: f32,
    r: f32,
    g: f32,
    b: f32,
}

pub struct Target {
    pub w: i32,
    pub h: i32,
    pub buf: Vec<u32>,
    pub zb: Vec<f32>,
}

#[inline(always)]
fn wsum(e1: f32, e2: f32, e0: f32, p0: f32, p1: f32, p2: f32, inv: f32) -> f32 {
    (e1 * p0 + e2 * p1 + e0 * p2) * inv
}

impl Target {
    pub fn new(w: i32, h: i32) -> Target {
        let n = (w.max(1) * h.max(1)) as usize;
        Target {
            w,
            h,
            buf: vec![0u32; n],
            zb: vec![0f32; n],
        }
    }

    pub fn resize(&mut self, w: i32, h: i32) {
        if w == self.w && h == self.h {
            return;
        }
        let n = (w.max(1) * h.max(1)) as usize;
        self.w = w;
        self.h = h;
        self.buf.resize(n, 0);
        self.zb.resize(n, 0.0);
    }

    #[inline]
    pub fn clear(&mut self, c: u32) {
        self.buf.fill(c);
    }

    #[inline]
    pub fn clear_z(&mut self) {
        self.zb.fill(0.0);
    }

    /// Vertical sky gradient with a horizon that tracks the view pitch and a
    /// soft sun bloom.
    pub fn sky(&mut self, horizon: f32, top: [f32; 3], bot: [f32; 3], sun_x: f32, sun_y: f32) {
        let hf = self.h as f32;
        let hw = self.w as f32 * 0.5;
        for y in 0..self.h {
            let fy = y as f32;
            let span = (1.0 - horizon).max(0.001);
            let t = clamp((fy / hf - horizon) / span, 0.0, 1.0).powf(0.75);
            let row = (y * self.w) as usize;
            for x in 0..self.w {
                let sx = (x as f32 - hw) / hw;
                let sy = (fy / hf - horizon) * 2.0;
                let dx = sx - sun_x;
                let dy = sy - sun_y;
                let d2 = dx * dx + dy * dy;
                let glow = (1.0 / (1.0 + d2 * 20.0)) * 0.5;
                let r = lerp(top[0], bot[0], t) + glow * 0.95;
                let g = lerp(top[1], bot[1], t) + glow * 0.72;
                let b = lerp(top[2], bot[2], t) + glow * 0.45;
                self.buf[row + x as usize] = pack(r, g, b);
            }
        }
    }

    /// Project a view-space point. Returns screen x, y and 1/w (depth key).
    #[inline]
    pub fn project(&self, pr: &Proj, p: V3) -> Option<(f32, f32, f32)> {
        let cw = -p.z;
        if cw < pr.near {
            return None;
        }
        let iw = 1.0 / cw;
        let sx = (pr.a * p.x * iw * 0.5 + 0.5) * self.w as f32;
        let sy = (1.0 - (pr.b * p.y * iw * 0.5 + 0.5)) * self.h as f32;
        Some((sx, sy, iw))
    }

    // -- the pipeline --------------------------------------------------------

    pub fn draw_tris(
        &mut self,
        tris: &[Tri],
        pr: &Proj,
        lt: &Light,
        fog: &[f32; 3],
        fog_near: f32,
        fog_far: f32,
        texs: &[Tex],
    ) {
        let wf = self.w as f32;
        let hf = self.h as f32;
        let fog_span = (fog_far - fog_near).max(0.001);

        for t in tris {
            // --- transform to clip space and shade --------------------------
            let mut v = [Cv::default(); 3];
            let mut behind = 0;
            for k in 0..3 {
                let p = t.p[k];
                let cw = -p.z;
                if cw < pr.near {
                    behind += 1;
                }
                let mut nrm = t.n[k];
                let nl = nrm.len2();
                if nl < 1e-12 {
                    nrm = v3(0.0, 1.0, 0.0);
                } else {
                    nrm = nrm.scale(1.0 / nl.sqrt());
                }
                // Two-sided: flip normals that face away, so nothing turns
                // black when a surface is seen from behind.
                if nrm.dot(p) > 0.0 {
                    nrm = nrm.neg();
                }
                let key = nrm.dot(lt.key).max(0.0);
                let hemi = nrm.y * 0.5 + 0.5;
                let fogt = clamp((cw - fog_near) / fog_span, 0.0, 1.0);
                let keep = 1.0 - fogt;
                let e = t.emis * 3.0;
                let r0 = t.col[0] * (lt.sky[0] * hemi + lt.ground[0] * (1.0 - hemi) + lt.key_c[0] * key + e);
                let g0 = t.col[1] * (lt.sky[1] * hemi + lt.ground[1] * (1.0 - hemi) + lt.key_c[1] * key + e);
                let b0 = t.col[2] * (lt.sky[2] * hemi + lt.ground[2] * (1.0 - hemi) + lt.key_c[2] * key + e);

                v[k] = Cv {
                    x: pr.a * p.x,
                    y: pr.b * p.y,
                    z: pr.c * p.z + pr.d,
                    w: cw,
                    u: t.uv[k][0],
                    v: t.uv[k][1],
                    r: r0 * keep + fog[0] * fogt,
                    g: g0 * keep + fog[1] * fogt,
                    b: b0 * keep + fog[2] * fogt,
                };
            }
            if behind == 3 {
                continue;
            }

            // --- near-plane clip (a triangle can fan out to four vertices) ---
            let mut poly = [Cv::default(); 8];
            let pn = if behind > 0 {
                clip_near(&v, &mut poly, pr.near)
            } else {
                poly[0] = v[0];
                poly[1] = v[1];
                poly[2] = v[2];
                3
            };
            if pn < 3 {
                continue;
            }

            let tex = if t.mat >= 0 {
                Some(&texs[t.mat as usize].d)
            } else {
                None
            };
            for k in 1..pn - 1 {
                self.raster(poly[0], poly[k], poly[k + 1], tex, t.add, wf, hf);
            }
        }
    }

    #[inline(always)]
    fn raster(&mut self, a: Cv, b: Cv, c: Cv, tex: Option<&Vec<u32>>, add: bool, wf: f32, hf: f32) {
        let (aw, bw, cw) = (1.0 / a.w, 1.0 / b.w, 1.0 / c.w);
        let ax = (a.x * aw * 0.5 + 0.5) * wf;
        let ay = (1.0 - (a.y * aw * 0.5 + 0.5)) * hf;
        let bx = (b.x * bw * 0.5 + 0.5) * wf;
        let by = (1.0 - (b.y * bw * 0.5 + 0.5)) * hf;
        let cx = (c.x * cw * 0.5 + 0.5) * wf;
        let cy = (1.0 - (c.y * cw * 0.5 + 0.5)) * hf;

        // e0 is the edge AB evaluated at a point; its value at C is twice the
        // signed area. Weight of vertex C is therefore e0 / area.
        let area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if area.abs() < 1e-7 {
            return;
        }
        let sgn = if area < 0.0 { -1.0 } else { 1.0 };
        let inv = sgn / area;

        let mut minx = ax.min(bx).min(cx).floor() as i32;
        let mut miny = ay.min(by).min(cy).floor() as i32;
        let mut maxx = ax.max(bx).max(cx).ceil() as i32;
        let mut maxy = ay.max(by).max(cy).ceil() as i32;
        if minx < 0 {
            minx = 0;
        }
        if miny < 0 {
            miny = 0;
        }
        if maxx > self.w - 1 {
            maxx = self.w - 1;
        }
        if maxy > self.h - 1 {
            maxy = self.h - 1;
        }
        if minx > maxx || miny > maxy {
            return;
        }

        // Edge functions, sign-corrected so "inside" is always >= 0.
        let d0x = -(by - ay) * sgn;
        let d0y = (bx - ax) * sgn;
        let d1x = -(cy - by) * sgn;
        let d1y = (cx - bx) * sgn;
        let d2x = -(ay - cy) * sgn;
        let d2y = (ax - cx) * sgn;

        // Perspective-correct attributes are stored divided by w, then
        // interpolated linearly in screen space.
        let (ua, va) = (a.u * aw, a.v * aw);
        let (ub, vb) = (b.u * bw, b.v * bw);
        let (uc, vc) = (c.u * cw, c.v * cw);

        let px0 = minx as f32 + 0.5;
        let py0 = miny as f32 + 0.5;
        let mut e0r = ((bx - ax) * (py0 - ay) - (by - ay) * (px0 - ax)) * sgn;
        let mut e1r = ((cx - bx) * (py0 - by) - (cy - by) * (px0 - bx)) * sgn;
        let mut e2r = ((ax - cx) * (py0 - cy) - (ay - cy) * (px0 - cx)) * sgn;

        let (qi, dix, diy) = (
            wsum(e1r, e2r, e0r, aw, bw, cw, inv),
            wsum(d1x, d2x, d0x, aw, bw, cw, inv),
            wsum(d1y, d2y, d0y, aw, bw, cw, inv),
        );
        let (qu, dux, duy) = (
            wsum(e1r, e2r, e0r, ua, ub, uc, inv),
            wsum(d1x, d2x, d0x, ua, ub, uc, inv),
            wsum(d1y, d2y, d0y, ua, ub, uc, inv),
        );
        let (qv, dvx, dvy) = (
            wsum(e1r, e2r, e0r, va, vb, vc, inv),
            wsum(d1x, d2x, d0x, va, vb, vc, inv),
            wsum(d1y, d2y, d0y, va, vb, vc, inv),
        );
        let (qr, drx, dry) = (
            wsum(e1r, e2r, e0r, a.r, b.r, c.r, inv),
            wsum(d1x, d2x, d0x, a.r, b.r, c.r, inv),
            wsum(d1y, d2y, d0y, a.r, b.r, c.r, inv),
        );
        let (qg, dgx, dgy) = (
            wsum(e1r, e2r, e0r, a.g, b.g, c.g, inv),
            wsum(d1x, d2x, d0x, a.g, b.g, c.g, inv),
            wsum(d1y, d2y, d0y, a.g, b.g, c.g, inv),
        );
        let (qb, dbx, dby) = (
            wsum(e1r, e2r, e0r, a.b, b.b, c.b, inv),
            wsum(d1x, d2x, d0x, a.b, b.b, c.b, inv),
            wsum(d1y, d2y, d0y, a.b, b.b, c.b, inv),
        );

        let buf = &mut self.buf;
        let zb = &mut self.zb;
        let stride = self.w;

        // Mutable row-start accumulators for the six interpolated values.
        let (mut rq, mut ru, mut rv, mut rr, mut rg, mut rb) = (qi, qu, qv, qr, qg, qb);

        for y in miny..=maxy {
            let mut e0 = e0r;
            let mut e1 = e1r;
            let mut e2 = e2r;
            let mut pi = rq;
            let mut pu = ru;
            let mut pv = rv;
            let mut pr = rr;
            let mut pg = rg;
            let mut pb = rb;
            let row = (y * stride) as usize;

            for x in minx..=maxx {
                if e0 >= 0.0 && e1 >= 0.0 && e2 >= 0.0 {
                    let o = row + x as usize;
                    if add || pi > zb[o] {
                        let (mut rr, mut gg, mut bb) = (pr, pg, pb);
                        if let Some(td) = tex {
                            let iw = 1.0 / pi;
                            let u = pu * iw;
                            let v = pv * iw;
                            let sxp = (((u + 16.0) * TS as f32) as i32 & TMASK) as usize;
                            let syp = (((v + 16.0) * TS as f32) as i32 & TMASK) as usize;
                            let tcol = td[syp * TS + sxp];
                            // Texture modulates the lit colour; 0.5 is neutral.
                            rr *= (((tcol >> 16) & 255) as f32 / 255.0) * 2.0;
                            gg *= (((tcol >> 8) & 255) as f32 / 255.0) * 2.0;
                            bb *= ((tcol & 255) as f32 / 255.0) * 2.0;
                        }
                        if add {
                            let prev = buf[o];
                            let ar = (((prev >> 16) & 255) as f32 + rr * 255.0).min(255.0) as u32;
                            let ag = (((prev >> 8) & 255) as f32 + gg * 255.0).min(255.0) as u32;
                            let ab = ((prev & 255) as f32 + bb * 255.0).min(255.0) as u32;
                            buf[o] = rgb(ar, ag, ab);
                        } else {
                            zb[o] = pi;
                            buf[o] = pack(rr, gg, bb);
                        }
                    }
                }
                e0 += d0x;
                e1 += d1x;
                e2 += d2x;
                pi += dix;
                pu += dux;
                pv += dvx;
                pr += drx;
                pg += dgx;
                pb += dbx;
            }

            e0r += d0y;
            e1r += d1y;
            e2r += d2y;
            rq += diy;
            ru += duy;
            rv += dvy;
            rr += dry;
            rg += dgy;
            rb += dby;
        }
    }

    // -- 2D primitives -------------------------------------------------------

    #[inline(always)]
    pub fn px(&mut self, x: i32, y: i32, c: u32) {
        if x >= 0 && y >= 0 && x < self.w && y < self.h {
            self.buf[(y * self.w + x) as usize] = c;
        }
    }

    pub fn blend(&mut self, x: i32, y: i32, c: u32, a: f32) {
        if a <= 0.0 || x < 0 || y < 0 || x >= self.w || y >= self.h {
            return;
        }
        let ia = a.min(1.0);
        let o = (y * self.w + x) as usize;
        let p = self.buf[o];
        let r = lerp(((p >> 16) & 255) as f32, ((c >> 16) & 255) as f32, ia) as u32;
        let g = lerp(((p >> 8) & 255) as f32, ((c >> 8) & 255) as f32, ia) as u32;
        let b = lerp((p & 255) as f32, (c & 255) as f32, ia) as u32;
        self.buf[o] = rgb(r, g, b);
    }

    pub fn add_px(&mut self, x: i32, y: i32, c: u32, a: f32) {
        if x < 0 || y < 0 || x >= self.w || y >= self.h {
            return;
        }
        let o = (y * self.w + x) as usize;
        let p = self.buf[o];
        let r = (((p >> 16) & 255) as f32 + ((c >> 16) & 255) as f32 * a).min(255.0) as u32;
        let g = (((p >> 8) & 255) as f32 + ((c >> 8) & 255) as f32 * a).min(255.0) as u32;
        let b = ((p & 255) as f32 + (c & 255) as f32 * a).min(255.0) as u32;
        self.buf[o] = rgb(r, g, b);
    }

    pub fn rect(&mut self, x: i32, y: i32, w: i32, h: i32, c: u32) {
        let x0 = x.max(0);
        let y0 = y.max(0);
        let x1 = (x + w).min(self.w);
        let y1 = (y + h).min(self.h);
        if x1 <= x0 || y1 <= y0 {
            return;
        }
        for yy in y0..y1 {
            let o = (yy * self.w + x0) as usize;
            self.buf[o..(o + (x1 - x0) as usize)].fill(c);
        }
    }

    pub fn rect_a(&mut self, x: i32, y: i32, w: i32, h: i32, c: u32, a: f32) {
        let x0 = x.max(0);
        let y0 = y.max(0);
        let x1 = (x + w).min(self.w);
        let y1 = (y + h).min(self.h);
        let ia = a.clamp(0.0, 1.0);
        let (cr, cg, cb) = (
            ((c >> 16) & 255) as f32,
            ((c >> 8) & 255) as f32,
            (c & 255) as f32,
        );
        for yy in y0..y1 {
            for xx in x0..x1 {
                let o = (yy * self.w + xx) as usize;
                let p = self.buf[o];
                let r = lerp(((p >> 16) & 255) as f32, cr, ia) as u32;
                let g = lerp(((p >> 8) & 255) as f32, cg, ia) as u32;
                let b = lerp((p & 255) as f32, cb, ia) as u32;
                self.buf[o] = rgb(r, g, b);
            }
        }
    }

    pub fn line(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, c: u32) {
        let dx = x1 - x0;
        let dy = y1 - y0;
        let n = (dx.abs().max(dy.abs()) as i32).max(1);
        let sx = dx / n as f32;
        let sy = dy / n as f32;
        let (mut x, mut y) = (x0, y0);
        for _ in 0..=n {
            self.px(x as i32, y as i32, c);
            x += sx;
            y += sy;
        }
    }

    pub fn line_a(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, c: u32, a: f32) {
        let dx = x1 - x0;
        let dy = y1 - y0;
        let n = (dx.abs().max(dy.abs()) as i32).max(1);
        let sx = dx / n as f32;
        let sy = dy / n as f32;
        let (mut x, mut y) = (x0, y0);
        for _ in 0..=n {
            self.blend(x as i32, y as i32, c, a);
            x += sx;
            y += sy;
        }
    }

    /// Soft additive radial glow: muzzle flash, impact sparks, pickups.
    pub fn glow(&mut self, cx: f32, cy: f32, r: f32, c: u32, a: f32) {
        if r <= 0.0 {
            return;
        }
        let x0 = (cx - r).max(0.0) as i32;
        let y0 = (cy - r).max(0.0) as i32;
        let x1 = (cx + r).min(self.w as f32 - 1.0) as i32;
        let y1 = (cy + r).min(self.h as f32 - 1.0) as i32;
        let r2 = r * r;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let dx = x as f32 - cx;
                let dy = y as f32 - cy;
                let d2 = dx * dx + dy * dy;
                if d2 > r2 {
                    continue;
                }
                let f = 1.0 - d2 / r2;
                self.add_px(x, y, c, a * f * f);
            }
        }
    }

    pub fn circle(&mut self, cx: f32, cy: f32, r: f32, c: u32) {
        let steps = (r * 3.0).max(10.0) as i32;
        for i in 0..steps {
            let t = i as f32 / steps as f32 * TAU;
            self.px((cx + t.cos() * r) as i32, (cy + t.sin() * r) as i32, c);
        }
    }

    pub fn text(&mut self, s: &str, x: i32, y: i32, sc: i32, c: u32) {
        let mut cx = x;
        for ch in s.chars() {
            let g = font::glyph(ch);
            for ry in 0..font::GLYPH_H {
                let bits = g[ry as usize];
                if bits == 0 {
                    continue;
                }
                for rx in 0..font::GLYPH_W {
                    if bits & (1 << (4 - rx)) != 0 {
                        self.rect(cx + rx * sc, y + ry * sc, sc, sc, c);
                    }
                }
            }
            cx += (font::GLYPH_W + 1) * sc;
        }
    }

    pub fn text_shadow(&mut self, s: &str, x: i32, y: i32, sc: i32, c: u32) {
        self.text(s, x + sc, y + sc, sc, rgb(0, 0, 0));
        self.text(s, x, y, sc, c);
    }

    pub fn text_c_shadow(&mut self, s: &str, cx: i32, y: i32, sc: i32, c: u32) {
        let w = font::text_width(s, sc);
        let x = cx - w / 2;
        self.text(s, x + sc, y + sc, sc, rgb(0, 0, 0));
        self.text(s, x, y, sc, c);
    }

    /// Darken the corners so the image does not look flat.
    pub fn vignette(&mut self, strength: f32) {
        let (wf, hf) = (self.w as f32, self.h as f32);
        let cx = wf * 0.5;
        let cy = hf * 0.5;
        let maxd = (cx * cx + cy * cy).sqrt();
        for y in 0..self.h {
            let dy = y as f32 - cy;
            for x in 0..self.w {
                let dx = x as f32 - cx;
                let d = (dx * dx + dy * dy).sqrt() / maxd;
                let f = 1.0 - (d * d * strength).min(0.85);
                let o = (y * self.w + x) as usize;
                let p = self.buf[o];
                let r = (((p >> 16) & 255) as f32 * f) as u32;
                let g = (((p >> 8) & 255) as f32 * f) as u32;
                let b = ((p & 255) as f32 * f) as u32;
                self.buf[o] = rgb(r, g, b);
            }
        }
    }

    /// Full-screen colour wash: damage flash, death fade.
    pub fn wash(&mut self, c: u32, a: f32) {
        if a <= 0.0 {
            return;
        }
        let ia = a.min(1.0);
        let (cr, cg, cb) = (
            ((c >> 16) & 255) as f32,
            ((c >> 8) & 255) as f32,
            (c & 255) as f32,
        );
        for p in self.buf.iter_mut() {
            let r = lerp(((*p >> 16) & 255) as f32, cr, ia) as u32;
            let g = lerp(((*p >> 8) & 255) as f32, cg, ia) as u32;
            let b = lerp((*p & 255) as f32, cb, ia) as u32;
            *p = rgb(r, g, b);
        }
    }

    /// 4x4 ordered dither. Hides banding in the sky for almost nothing.
    pub fn dither(&mut self) {
        const M: [f32; 16] = [
            0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0,
        ];
        for y in 0..self.h {
            for x in 0..self.w {
                let o = (y * self.w + x) as usize;
                let p = self.buf[o];
                let n = M[((y & 3) * 4 + (x & 3)) as usize] / 16.0 - 0.5;
                let r = (((p >> 16) & 255) as f32 + n).clamp(0.0, 255.0) as u32;
                let g = (((p >> 8) & 255) as f32 + n).clamp(0.0, 255.0) as u32;
                let b = ((p & 255) as f32 + n).clamp(0.0, 255.0) as u32;
                self.buf[o] = rgb(r, g, b);
            }
        }
    }
}

/// Sutherland-Hodgman against the single plane `w >= near`.
/// Returns the number of vertices written (3 or 4 for a triangle).
fn clip_near(inp: &[Cv], out: &mut [Cv], near: f32) -> usize {
    let n = inp.len();
    let mut count = 0usize;
    for i in 0..n {
        let a = inp[i];
        let b = inp[(i + 1) % n];
        let da = a.w - near;
        let db = b.w - near;
        if da >= 0.0 {
            out[count] = a;
            count += 1;
        }
        if (da >= 0.0) != (db >= 0.0) {
            let t = da / (da - db);
            out[count] = Cv {
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
                z: a.z + (b.z - a.z) * t,
                w: near,
                u: a.u + (b.u - a.u) * t,
                v: a.v + (b.v - a.v) * t,
                r: a.r + (b.r - a.r) * t,
                g: a.g + (b.g - a.g) * t,
                b: a.b + (b.b - a.b) * t,
            };
            count += 1;
        }
    }
    count
}
