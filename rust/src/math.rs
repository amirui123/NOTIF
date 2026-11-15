//! Minimal linear algebra: 3-vectors and 4x4 row-major matrices.
//! Only what the renderer actually needs.

pub const PI: f32 = 3.14159265358979;
pub const TAU: f32 = PI * 2.0;

#[derive(Clone, Copy, Debug)]
pub struct V3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[inline(always)]
pub fn v3(x: f32, y: f32, z: f32) -> V3 {
    V3 { x, y, z }
}

impl V3 {
    #[inline(always)]
    pub fn add(self, o: V3) -> V3 {
        v3(self.x + o.x, self.y + o.y, self.z + o.z)
    }
    #[inline(always)]
    pub fn sub(self, o: V3) -> V3 {
        v3(self.x - o.x, self.y - o.y, self.z - o.z)
    }
    #[inline(always)]
    pub fn scale(self, s: f32) -> V3 {
        v3(self.x * s, self.y * s, self.z * s)
    }
    #[inline(always)]
    pub fn neg(self) -> V3 {
        v3(-self.x, -self.y, -self.z)
    }
    #[inline(always)]
    pub fn dot(self, o: V3) -> f32 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    #[inline(always)]
    pub fn cross(self, o: V3) -> V3 {
        v3(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }
    #[inline(always)]
    pub fn len2(self) -> f32 {
        self.dot(self)
    }
    #[inline(always)]
    pub fn len(self) -> f32 {
        self.len2().sqrt()
    }
    /// Safe normalise: a zero vector stays zero instead of becoming NaN.
    #[inline(always)]
    pub fn norm(self) -> V3 {
        let l2 = self.len2();
        if l2 < 1e-20 {
            v3(0.0, 0.0, 0.0)
        } else {
            self.scale(1.0 / l2.sqrt())
        }
    }
}

#[inline(always)]
pub fn clamp(v: f32, lo: f32, hi: f32) -> f32 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

#[inline(always)]
pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Row-major 4x4. `m[row][col]`.
#[derive(Clone, Copy)]
pub struct M4 {
    pub m: [[f32; 4]; 4],
}

pub fn m4_mul(a: &M4, b: &M4) -> M4 {
    let mut o = [[0f32; 4]; 4];
    for r in 0..4 {
        for c in 0..4 {
            o[r][c] = a.m[r][0] * b.m[0][c]
                + a.m[r][1] * b.m[1][c]
                + a.m[r][2] * b.m[2][c]
                + a.m[r][3] * b.m[3][c];
        }
    }
    M4 { m: o }
}

/// World -> view. The camera sits at `eye` and looks down its own -Z, so a
/// point directly ahead has a negative view-space z.
pub fn m4_view(eye: V3, yaw: f32, pitch: f32) -> M4 {
    let cp = pitch.cos();
    let f = v3(-yaw.sin() * cp, pitch.sin(), -yaw.cos() * cp);
    let r = v3(yaw.cos(), 0.0, -yaw.sin());
    let u = r.cross(f);
    M4 {
        m: [
            [r.x, r.y, r.z, -r.dot(eye)],
            [u.x, u.y, u.z, -u.dot(eye)],
            [-f.x, -f.y, -f.z, f.dot(eye)],
            [0.0, 0.0, 0.0, 1.0],
        ],
    }
}

/// Translation * Ry * Rx * Rz * uniform scale. Used to place the viewmodel
/// and the enemies.
pub fn m4_trs(pos: V3, rot: V3, scale: f32) -> M4 {
    let (cy, sy) = (rot.y.cos(), rot.y.sin());
    let (cx, sx) = (rot.x.cos(), rot.x.sin());
    let (cz, sz) = (rot.z.cos(), rot.z.sin());
    // R = Ry * Rx * Rz, row-major.
    let r00 = cy * cz + sy * sx * sz;
    let r01 = -cy * sz + sy * sx * cz;
    let r02 = sy * cx;
    let r10 = cx * sz;
    let r11 = cx * cz;
    let r12 = -sx;
    let r20 = -sy * cz + cy * sx * sz;
    let r21 = sy * sz + cy * sx * cz;
    let r22 = cy * cx;
    M4 {
        m: [
            [r00 * scale, r01 * scale, r02 * scale, pos.x],
            [r10 * scale, r11 * scale, r12 * scale, pos.y],
            [r20 * scale, r21 * scale, r22 * scale, pos.z],
            [0.0, 0.0, 0.0, 1.0],
        ],
    }
}

/// Full affine transform of a point (assumes the incoming w is 1).
#[inline(always)]
pub fn m4_xform(m: &M4, p: V3) -> V3 {
    v3(
        m.m[0][0] * p.x + m.m[0][1] * p.y + m.m[0][2] * p.z + m.m[0][3],
        m.m[1][0] * p.x + m.m[1][1] * p.y + m.m[1][2] * p.z + m.m[1][3],
        m.m[2][0] * p.x + m.m[2][1] * p.y + m.m[2][2] * p.z + m.m[2][3],
    )
}

/// Rotation-only transform (direction/normal). Scale is uniform, so no
/// inverse-transpose is required.
#[inline(always)]
pub fn m4_dir(m: &M4, p: V3) -> V3 {
    v3(
        m.m[0][0] * p.x + m.m[0][1] * p.y + m.m[0][2] * p.z,
        m.m[1][0] * p.x + m.m[1][1] * p.y + m.m[1][2] * p.z,
        m.m[2][0] * p.x + m.m[2][1] * p.y + m.m[2][2] * p.z,
    )
}

/// A projection matrix collapsed to the four scalars the rasteriser needs.
/// Clip coords are `x = a*vx`, `y = b*vy`, `z = c*vz + d`, `w = -vz`.
#[derive(Clone, Copy)]
pub struct Proj {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub near: f32,
}

pub fn proj_new(fovy: f32, aspect: f32, near: f32, far: f32) -> Proj {
    let f = 1.0 / (fovy * 0.5).tan();
    Proj {
        a: f / aspect,
        b: f,
        c: (far + near) / (near - far),
        d: 2.0 * far * near / (near - far),
        near,
    }
}

/// Slab ray/AABB test. Returns the distance along `d` (which must be
/// normalised) of the first hit, or `None`.
pub fn ray_box(o: V3, d: V3, min: V3, max: V3) -> Option<f32> {
    let mut tmin = 0.0f32;
    let mut tmax = f32::MAX;
    for i in 0..3 {
        let (oo, dd) = (axis(o, i), axis(d, i));
        let (lo, hi) = (axis(min, i), axis(max, i));
        if dd.abs() < 1e-9 {
            if oo < lo || oo > hi {
                return None;
            }
            continue;
        }
        let inv = 1.0 / dd;
        let (mut t1, mut t2) = ((lo - oo) * inv, (hi - oo) * inv);
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

#[inline(always)]
pub fn axis(v: V3, i: usize) -> f32 {
    match i {
        0 => v.x,
        1 => v.y,
        _ => v.z,
    }
}
