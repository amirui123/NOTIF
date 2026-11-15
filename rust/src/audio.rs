//! A tiny procedural sound engine on top of the Win32 waveOut API.
//!
//! There are no sound files: a gunshot is a filtered noise burst with a low
//! thump under it, a hit marker is a short tone. Everything is synthesised
//! per sample.

use crate::win::*;
use core::mem::size_of;
use std::sync::atomic::{AtomicI32, Ordering};

const SR: u32 = 22050;
const FRAMES: usize = 1024; // ~46 ms per buffer
const NBUF: usize = 3;
const DT: f32 = 1.0 / SR as f32;
const MAXV: usize = 40;

static FREE: AtomicI32 = AtomicI32::new(0);

unsafe extern "system" fn wave_cb(_h: HWAVEOUT, msg: u32, _inst: usize, _p1: usize, _p2: usize) {
    if msg == WOM_DONE {
        FREE.fetch_add(1, Ordering::SeqCst);
    }
}

#[derive(Clone, Copy)]
struct Voice {
    kind: u8, // 0 noise, 1 sine, 2 sweep, 3 square
    f: f32,   // frequency, or lowpass coefficient for noise
    f2: f32,
    amp: f32,
    decay: f32,
    t: f32,
    life: f32,
    pan: f32,
    lp: f32,
    ph: f32,
    seed: u64,
}

impl Voice {
    fn blank() -> Voice {
        Voice {
            kind: 0,
            f: 0.0,
            f2: 0.0,
            amp: 0.0,
            decay: 1.0,
            t: 0.0,
            life: 0.0,
            pan: 0.0,
            lp: 0.0,
            ph: 0.0,
            seed: 1,
        }
    }
}

pub struct Audio {
    ok: bool,
    hwo: HWAVEOUT,
    hdrs: Box<[WAVEHDR; NBUF]>,
    data: Box<[[i16; FRAMES * 2]; NBUF]>,
    next: usize,
    voices: [Voice; MAXV],
    nv: usize,
    master: f32,
}

impl Audio {
    pub fn new() -> Audio {
        let mut a = Audio {
            ok: false,
            hwo: core::ptr::null_mut(),
            hdrs: Box::new(unsafe { core::mem::zeroed::<[WAVEHDR; NBUF]>() }),
            data: Box::new([[0i16; FRAMES * 2]; NBUF]),
            next: 0,
            voices: [Voice::blank(); MAXV],
            nv: 0,
            master: 0.62,
        };
        unsafe {
            let fmt = WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_PCM,
                nChannels: 2,
                nSamplesPerSec: SR,
                nAvgBytesPerSec: SR * 4,
                nBlockAlign: 4,
                wBitsPerSample: 16,
                cbSize: 0,
            };
            let mut hwo: HWAVEOUT = core::ptr::null_mut();
            let rc = waveOutOpen(
                &mut hwo,
                WAVE_MAPPER,
                &fmt,
                wave_cb as *const () as usize,
                0,
                CALLBACK_FUNCTION,
            );
            if rc != MMSYSERR_NOERROR || hwo.is_null() {
                return a;
            }
            a.hwo = hwo;
            for i in 0..NBUF {
                let p = a.data[i].as_mut_ptr() as *mut u8;
                a.hdrs[i].lpData = p;
                a.hdrs[i].dwBufferLength = (FRAMES * 4) as u32;
                a.hdrs[i].dwFlags = 0;
                a.hdrs[i].dwLoops = 0;
                waveOutPrepareHeader(hwo, &mut a.hdrs[i], size_of::<WAVEHDR>() as u32);
                a.render_into(i);
                waveOutWrite(hwo, &mut a.hdrs[i], size_of::<WAVEHDR>() as u32);
            }
            a.ok = true;
            FREE.store(0, Ordering::SeqCst);
        }
        a
    }

    /// Top up every buffer the driver has finished with. Call once a frame.
    pub fn update(&mut self) {
        if !self.ok {
            return;
        }
        let free = FREE.swap(0, Ordering::SeqCst);
        for _ in 0..free.min(NBUF as i32) {
            let i = self.next;
            self.next = (self.next + 1) % NBUF;
            self.render_into(i);
            unsafe {
                waveOutWrite(self.hwo, &mut self.hdrs[i], size_of::<WAVEHDR>() as u32);
            }
        }
    }

    /// Mix into a scratch buffer first: `step()` needs `&mut self`, so the
    /// device buffer cannot be borrowed across the call.
    fn render_into(&mut self, i: usize) {
        let mut tmp = [0i16; FRAMES * 2];
        for f in 0..FRAMES {
            let (l, r) = self.step();
            tmp[f * 2] = (l * 32767.0) as i16;
            tmp[f * 2 + 1] = (r * 32767.0) as i16;
        }
        self.data[i].copy_from_slice(&tmp);
    }

    fn step(&mut self) -> (f32, f32) {
        let (mut l, mut r) = (0.0f32, 0.0f32);
        let n = self.nv;
        for i in 0..n {
            let v = &mut self.voices[i];
            let env = (-v.t * v.decay).exp();
            let raw = match v.kind {
                1 => {
                    v.ph += v.f * std::f32::consts::TAU * DT;
                    v.ph.sin()
                }
                2 => {
                    let k = (v.t / v.life.max(0.001)).min(1.0);
                    v.ph += (v.f + (v.f2 - v.f) * k) * std::f32::consts::TAU * DT;
                    v.ph.sin()
                }
                3 => {
                    v.ph += v.f * DT;
                    if v.ph >= 1.0 {
                        v.ph -= 1.0;
                    }
                    if v.ph < 0.5 {
                        1.0
                    } else {
                        -1.0
                    }
                }
                _ => {
                    v.seed = v.seed
                        .wrapping_mul(6364136223846793005)
                        .wrapping_add(1442695040888963407);
                    let x = ((v.seed >> 33) as u32 as f32 / 4294967296.0) * 2.0 - 1.0;
                    v.lp += (x - v.lp) * v.f; // one-pole lowpass, f in 0..1
                    v.lp
                }
            };
            let s = raw * env * v.amp;
            let pl = ((1.0 - v.pan) * 0.5).sqrt();
            let pr = ((1.0 + v.pan) * 0.5).sqrt();
            l += s * pl;
            r += s * pr;
            v.t += DT;
        }
        // Retire finished voices.
        let mut k = 0usize;
        for i in 0..n {
            if self.voices[i].t < self.voices[i].life {
                let c = self.voices[i];
                self.voices[k] = c;
                k += 1;
            }
        }
        self.nv = k;

        // Soft clip so a stack of shots never crackles.
        let m = self.master;
        ((l * m).tanh(), (r * m).tanh())
    }

    fn push(&mut self, v: Voice) {
        if self.nv >= MAXV {
            return;
        }
        self.voices[self.nv] = v;
        self.nv += 1;
    }

    fn noise(&mut self, amp: f32, cut: f32, decay: f32, life: f32, pan: f32, seed: u32) {
        self.push(Voice {
            kind: 0,
            f: cut,
            amp,
            decay,
            life,
            pan,
            seed: seed as u64 | 0x9E3779B97F4A7C15,
            ..Voice::blank()
        });
    }

    fn tone(&mut self, f: f32, amp: f32, decay: f32, life: f32, pan: f32) {
        self.push(Voice {
            kind: 1,
            f,
            amp,
            decay,
            life,
            pan,
            ..Voice::blank()
        });
    }

    fn sweep(&mut self, f0: f32, f1: f32, amp: f32, decay: f32, life: f32, pan: f32) {
        self.push(Voice {
            kind: 2,
            f: f0,
            f2: f1,
            amp,
            decay,
            life,
            pan,
            ..Voice::blank()
        });
    }

    fn blip(&mut self, f: f32, amp: f32, life: f32) {
        self.push(Voice {
            kind: 3,
            f,
            amp,
            decay: 26.0,
            life,
            ..Voice::blank()
        });
    }

    // --- game sounds --------------------------------------------------------

    /// `power` scales from a pistol (0.4) up to an LMG (1.0).
    pub fn shot(&mut self, power: f32) {
        self.noise(0.85 * power, 0.55, 34.0, 0.16, 0.0, 7);
        self.noise(0.55 * power, 0.13, 11.0, 0.34, 0.0, 19);
        self.tone(90.0 * (0.7 + power * 0.5), 0.42 * power, 22.0, 0.13, 0.0);
        // A short tail so the arena gives something back.
        self.noise(0.16 * power, 0.05, 4.5, 0.55, 0.0, 31);
    }

    pub fn dry(&mut self) {
        self.noise(0.30, 0.9, 190.0, 0.04, 0.0, 3);
    }

    pub fn reload(&mut self) {
        self.noise(0.34, 0.7, 130.0, 0.05, 0.0, 5);
        self.tone(220.0, 0.14, 60.0, 0.05, 0.0);
    }

    pub fn reload_done(&mut self) {
        self.noise(0.40, 0.6, 120.0, 0.06, 0.0, 11);
        self.tone(330.0, 0.16, 50.0, 0.07, 0.0);
    }

    pub fn hit(&mut self) {
        self.blip(1500.0, 0.16, 0.045);
    }

    pub fn headshot(&mut self) {
        self.blip(2100.0, 0.20, 0.06);
        self.blip(1500.0, 0.14, 0.05);
    }

    pub fn kill(&mut self, pan: f32) {
        self.sweep(420.0, 90.0, 0.30, 6.0, 0.45, pan);
        self.noise(0.22, 0.18, 9.0, 0.30, pan, 23);
    }

    pub fn hurt(&mut self) {
        self.noise(0.34, 0.10, 14.0, 0.22, 0.0, 13);
        self.tone(70.0, 0.26, 12.0, 0.20, 0.0);
    }

    pub fn footstep(&mut self, pan: f32) {
        self.noise(0.10, 0.22, 55.0, 0.07, pan, 41);
    }

    pub fn enemy_shot(&mut self, pan: f32) {
        self.noise(0.26, 0.35, 40.0, 0.12, pan, 53);
        self.tone(120.0, 0.10, 26.0, 0.09, pan);
    }

    pub fn wave_start(&mut self) {
        self.blip(520.0, 0.16, 0.10);
        self.blip(780.0, 0.16, 0.14);
    }

    pub fn swap(&mut self) {
        self.noise(0.24, 0.8, 150.0, 0.05, 0.0, 61);
    }

    pub fn menu(&mut self) {
        self.blip(660.0, 0.14, 0.08);
    }
}

impl Drop for Audio {
    fn drop(&mut self) {
        if !self.ok {
            return;
        }
        unsafe {
            waveOutReset(self.hwo);
            for i in 0..NBUF {
                waveOutUnprepareHeader(self.hwo, &mut self.hdrs[i], size_of::<WAVEHDR>() as u32);
            }
            waveOutClose(self.hwo);
        }
    }
}
