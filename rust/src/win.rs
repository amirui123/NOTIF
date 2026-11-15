//! The thinest possible Win32 layer, declared by hand.
//!
//! There is deliberately no `windows` or `winapi` crate here: every function
//! below is imported straight from the system DLLs. That is what keeps the
//! final executable free of third-party code.

// This is an API surface, not all of which the game uses; unused
// constants and imports are expected here.
#![allow(non_snake_case)]
#![allow(dead_code)]

use core::ffi::c_void;
use core::mem;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};

pub type HWND = *mut c_void;
pub type HDC = *mut c_void;
pub type HGDIOBJ = *mut c_void;
pub type HINSTANCE = *mut c_void;
pub type HICON = *mut c_void;
pub type HCURSOR = *mut c_void;
pub type HBRUSH = *mut c_void;
pub type HMENU = *mut c_void;
pub type HWAVEOUT = *mut c_void;
pub type ATOM = u16;
pub type BOOL = i32;
pub type LONG = i32;
pub type DWORD = u32;
pub type UINT = u32;
pub type WPARAM = usize;
pub type LPARAM = isize;
pub type LRESULT = isize;

pub type WNDPROC = unsafe extern "system" fn(HWND, UINT, WPARAM, LPARAM) -> LRESULT;

#[repr(C)]
pub struct POINT {
    pub x: LONG,
    pub y: LONG,
}

#[repr(C)]
pub struct RECT {
    pub left: LONG,
    pub top: LONG,
    pub right: LONG,
    pub bottom: LONG,
}

#[repr(C)]
pub struct MSG {
    pub hwnd: HWND,
    pub message: UINT,
    pub wParam: WPARAM,
    pub lParam: LPARAM,
    pub time: DWORD,
    pub pt: POINT,
    pub lPrivate: DWORD,
}

#[repr(C)]
pub struct WNDCLASSW {
    pub style: UINT,
    pub lpfnWndProc: WNDPROC,
    pub cbClsExtra: i32,
    pub cbWndExtra: i32,
    pub hInstance: HINSTANCE,
    pub hIcon: HICON,
    pub hCursor: HCURSOR,
    pub hbrBackground: HBRUSH,
    pub lpszMenuName: *const u16,
    pub lpszClassName: *const u16,
}

#[repr(C)]
pub struct BITMAPINFOHEADER {
    pub biSize: DWORD,
    pub biWidth: LONG,
    pub biHeight: LONG,
    pub biPlanes: u16,
    pub biBitCount: u16,
    pub biCompression: DWORD,
    pub biSizeImage: DWORD,
    pub biXPelsPerMeter: LONG,
    pub biYPelsPerMeter: LONG,
    pub biClrUsed: DWORD,
    pub biClrImportant: DWORD,
}

#[repr(C)]
pub struct BITMAPINFO {
    pub bmiHeader: BITMAPINFOHEADER,
    pub bmiColors: [u32; 1],
}

#[repr(C)]
pub struct WAVEFORMATEX {
    pub wFormatTag: u16,
    pub nChannels: u16,
    pub nSamplesPerSec: DWORD,
    pub nAvgBytesPerSec: DWORD,
    pub nBlockAlign: u16,
    pub wBitsPerSample: u16,
    pub cbSize: u16,
}

#[repr(C)]
pub struct WAVEHDR {
    pub lpData: *mut u8,
    pub dwBufferLength: DWORD,
    pub dwBufferLengthRecorded: DWORD,
    pub dwUser: usize,
    pub dwFlags: DWORD,
    pub dwLoops: DWORD,
    pub lpNext: usize,
    pub reserved: usize,
}

// --- messages and constants -------------------------------------------------

pub const WM_DESTROY: UINT = 0x0002;
pub const WM_CLOSE: UINT = 0x0010;
pub const WM_SIZE: UINT = 0x0005;
pub const WM_ERASEBKGND: UINT = 0x0014;
pub const WM_PAINT: UINT = 0x000F;
pub const WM_SETFOCUS: UINT = 0x0007;
pub const WM_KILLFOCUS: UINT = 0x0008;
pub const WM_SYSKEYDOWN: UINT = 0x0104;
pub const WM_KEYDOWN: UINT = 0x0100;
pub const PM_REMOVE: UINT = 0x0001;

pub const WS_OVERLAPPEDWINDOW: UINT = 0x00CF0000;
pub const WS_VISIBLE: UINT = 0x10000000;
pub const WS_POPUP: UINT = 0x80000000;
pub const WS_EX_TOPMOST: UINT = 0x00000008;
pub const SW_SHOW: i32 = 5;
pub const CW_USEDEFAULT: i32 = 0x80000000u32 as i32;

pub const DIB_RGB_COLORS: UINT = 0;
pub const SRCCOPY: UINT = 0x00CC0020;
pub const COLORONCOLOR: i32 = 3;
pub const BI_RGB: DWORD = 0;

pub const VK_LBUTTON: i32 = 0x01;
pub const VK_RBUTTON: i32 = 0x02;
pub const VK_MBUTTON: i32 = 0x04;
pub const VK_SHIFT: i32 = 0x10;
pub const VK_ESCAPE: i32 = 0x1B;
pub const VK_SPACE: i32 = 0x20;
pub const VK_RETURN: i32 = 0x0D;
pub const VK_TAB: i32 = 0x09;
pub const VK_BACK: i32 = 0x08;

pub const WAVE_MAPPER: usize = u32::MAX as usize;
pub const WAVE_FORMAT_PCM: u16 = 1;
pub const CALLBACK_FUNCTION: DWORD = 0x00030000;
pub const WOM_DONE: UINT = 0x03BD;
pub const WHDR_DONE: DWORD = 0x00000001;
pub const MMSYSERR_NOERROR: u32 = 0;

// --- imports ----------------------------------------------------------------

#[link(name = "kernel32")]
extern "system" {
    pub fn GetModuleHandleW(lpModuleName: *const u16) -> HINSTANCE;
    pub fn Sleep(dwMilliseconds: DWORD);
}

#[link(name = "user32")]
extern "system" {
    pub fn RegisterClassW(lpWndClass: *const WNDCLASSW) -> ATOM;
    pub fn CreateWindowExW(
        dwExStyle: DWORD,
        lpClassName: *const u16,
        lpWindowName: *const u16,
        dwStyle: DWORD,
        x: i32,
        y: i32,
        nWidth: i32,
        nHeight: i32,
        hWndParent: HWND,
        hMenu: HMENU,
        hInstance: HINSTANCE,
        lpParam: *mut c_void,
    ) -> HWND;
    pub fn DefWindowProcW(hWnd: HWND, Msg: UINT, wParam: WPARAM, lParam: LPARAM) -> LRESULT;
    pub fn PeekMessageW(
        lpMsg: *mut MSG,
        hWnd: HWND,
        wMsgFilterMin: UINT,
        wMsgFilterMax: UINT,
        wRemoveMsg: UINT,
    ) -> BOOL;
    pub fn TranslateMessage(lpMsg: *const MSG) -> BOOL;
    pub fn DispatchMessageW(lpMsg: *const MSG) -> LRESULT;
    pub fn PostQuitMessage(nExitCode: i32);
    pub fn GetDC(hWnd: HWND) -> HDC;
    pub fn ReleaseDC(hWnd: HWND, hdc: HDC) -> i32;
    pub fn GetClientRect(hWnd: HWND, lpRect: *mut RECT) -> BOOL;
    pub fn ClientToScreen(hWnd: HWND, lpPoint: *mut POINT) -> BOOL;
    pub fn AdjustWindowRect(lpRect: *mut RECT, dwStyle: DWORD, bMenu: BOOL) -> BOOL;
    pub fn GetSystemMetrics(nIndex: i32) -> i32;
    pub fn ShowWindow(hWnd: HWND, nCmdShow: i32) -> BOOL;
    pub fn SetProcessDPIAware() -> BOOL;
    pub fn GetAsyncKeyState(vKey: i32) -> i16;
    pub fn GetCursorPos(lpPoint: *mut POINT) -> BOOL;
    pub fn SetCursorPos(x: i32, y: i32) -> BOOL;
    pub fn ShowCursor(bShow: BOOL) -> i32;
    pub fn ClipCursor(lpRect: *const RECT) -> BOOL;
    pub fn LoadCursorW(hInstance: HINSTANCE, lpCursorName: *const u16) -> HCURSOR;
    pub fn SetForegroundWindow(hWnd: HWND) -> BOOL;
}

#[link(name = "gdi32")]
extern "system" {
    pub fn StretchDIBits(
        hdc: HDC,
        xDest: i32,
        yDest: i32,
        DestWidth: i32,
        DestHeight: i32,
        xSrc: i32,
        ySrc: i32,
        SrcWidth: i32,
        SrcHeight: i32,
        lpBits: *const c_void,
        lpbmi: *const BITMAPINFO,
        iUsage: UINT,
        dwRop: DWORD,
    ) -> i32;
    pub fn SetStretchBltMode(hdc: HDC, iStretchMode: i32) -> i32;
}

#[link(name = "winmm")]
extern "system" {
    pub fn waveOutOpen(
        phwo: *mut HWAVEOUT,
        uDeviceID: usize,
        pwfx: *const WAVEFORMATEX,
        dwCallback: usize,
        dwInstance: usize,
        fdwOpen: DWORD,
    ) -> u32;
    pub fn waveOutPrepareHeader(hwo: HWAVEOUT, pwh: *mut WAVEHDR, cbwh: UINT) -> u32;
    pub fn waveOutUnprepareHeader(hwo: HWAVEOUT, pwh: *mut WAVEHDR, cbwh: UINT) -> u32;
    pub fn waveOutWrite(hwo: HWAVEOUT, pwh: *mut WAVEHDR, cbwh: UINT) -> u32;
    pub fn waveOutReset(hwo: HWAVEOUT) -> u32;
    pub fn waveOutClose(hwo: HWAVEOUT) -> u32;
}

// --- window state shared with the message handler ---------------------------

pub static NEW_W: AtomicI32 = AtomicI32::new(0);
pub static NEW_H: AtomicI32 = AtomicI32::new(0);
pub static QUIT: AtomicBool = AtomicBool::new(false);
pub static FOCUS: AtomicBool = AtomicBool::new(true);

pub unsafe extern "system" fn wndproc(
    h: HWND,
    msg: UINT,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_DESTROY | WM_CLOSE => {
            PostQuitMessage(0);
            0
        }
        WM_SIZE => {
            let w = (lparam & 0xFFFF) as i32;
            let hh = ((lparam >> 16) & 0xFFFF) as i32;
            if w > 0 && hh > 0 {
                NEW_W.store(w, Ordering::Relaxed);
                NEW_H.store(hh, Ordering::Relaxed);
            }
            0
        }
        WM_ERASEBKGND => 1,
        WM_SETFOCUS => {
            FOCUS.store(true, Ordering::Relaxed);
            0
        }
        WM_KILLFOCUS => {
            FOCUS.store(false, Ordering::Relaxed);
            0
        }
        // Swallow the Alt-key menu beeps; the game reads keys directly.
        WM_SYSKEYDOWN => 0,
        WM_KEYDOWN => 0,
        _ => DefWindowProcW(h, msg, wparam, lparam),
    }
}

/// UTF-8 to a NUL-terminated UTF-16 buffer.
pub fn wide(s: &str) -> Vec<u16> {
    let mut v: Vec<u16> = s.encode_utf16().collect();
    v.push(0);
    v
}

pub struct Window {
    pub hwnd: HWND,
    pub hdc: HDC,
    pub w: i32,
    pub h: i32,
    class: Vec<u16>,
}

impl Window {
    pub fn new(title: &str, w: i32, h: i32) -> Option<Window> {
        unsafe {
            SetProcessDPIAware();
            let hinst = GetModuleHandleW(core::ptr::null());
            let class = wide("Sector7Cls");

            let wc = WNDCLASSW {
                style: 0x0002 | 0x0001, // CS_HREDRAW | CS_VREDRAW
                lpfnWndProc: wndproc,
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: hinst,
                hIcon: core::ptr::null_mut(),
                hCursor: LoadCursorW(core::ptr::null_mut(), 32512 as *const u16), // IDC_ARROW
                hbrBackground: core::ptr::null_mut(),
                lpszMenuName: core::ptr::null(),
                lpszClassName: class.as_ptr(),
            };
            if RegisterClassW(&wc) == 0 {
                return None;
            }

            let mut rc = RECT {
                left: 0,
                top: 0,
                right: w,
                bottom: h,
            };
            let style = WS_OVERLAPPEDWINDOW | WS_VISIBLE;
            AdjustWindowRect(&mut rc, style, 0);
            let fw = rc.right - rc.left;
            let fh = rc.bottom - rc.top;
            let sx = (GetSystemMetrics(0) - fw) / 2;
            let sy = (GetSystemMetrics(1) - fh) / 2;

            let hwnd = CreateWindowExW(
                0,
                class.as_ptr(),
                wide(title).as_ptr(),
                style,
                sx.max(0),
                sy.max(0),
                fw,
                fh,
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                hinst,
                core::ptr::null_mut(),
            );
            if hwnd.is_null() {
                return None;
            }
            ShowWindow(hwnd, SW_SHOW);
            SetForegroundWindow(hwnd);

            let mut cr = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            GetClientRect(hwnd, &mut cr);
            let cw = (cr.right - cr.left).max(1);
            let ch = (cr.bottom - cr.top).max(1);

            let hdc = GetDC(hwnd);
            SetStretchBltMode(hdc, COLORONCOLOR);

            Some(Window {
                hwnd,
                hdc,
                w: cw,
                h: ch,
                class,
            })
        }
    }

    /// Drain the message queue without blocking.
    pub fn pump(&mut self) {
        unsafe {
            let mut msg: MSG = mem::zeroed();
            while PeekMessageW(&mut msg, core::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if msg.message == 0x0012 {
                    // WM_QUIT
                    QUIT.store(true, Ordering::Relaxed);
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let nw = NEW_W.swap(0, Ordering::Relaxed);
            let nh = NEW_H.swap(0, Ordering::Relaxed);
            if nw > 0 && nh > 0 && (nw != self.w || nh != self.h) {
                self.w = nw;
                self.h = nh;
            }
        }
    }

    /// Confine the cursor to the client area so dragging never escapes.
    pub fn confine_cursor(&self) {
        unsafe {
            let mut tl = POINT { x: 0, y: 0 };
            let mut br = POINT {
                x: self.w - 1,
                y: self.h - 1,
            };
            ClientToScreen(self.hwnd, &mut tl);
            ClientToScreen(self.hwnd, &mut br);
            let r = RECT {
                left: tl.x,
                top: tl.y,
                right: br.x,
                bottom: br.y,
            };
            ClipCursor(&r);
        }
    }

    pub fn release_cursor(&self) {
        unsafe {
            ClipCursor(core::ptr::null());
        }
    }

    /// Blit a 0x00RRGGBB pixel buffer, scaling it to fill the client area.
    pub fn present(&self, buf: &[u32], bw: i32, bh: i32) {
        unsafe {
            let bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: bw,
                    biHeight: -bh, // negative = top-down rows
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [0],
            };
            StretchDIBits(
                self.hdc,
                0,
                0,
                self.w,
                self.h,
                0,
                0,
                bw,
                bh,
                buf.as_ptr() as *const c_void,
                &bmi,
                DIB_RGB_COLORS,
                SRCCOPY,
            );
        }
    }
}
