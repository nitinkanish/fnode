//! macOS Dock icon.
//!
//! `tauri dev` runs a raw binary, not an `.app`. Tauri then loads the `.icns`
//! into `NSImage`, which the Dock draws as a sharp square. We replace that
//! with the pre-squirreled PNG so FNode matches other app icons.

#[cfg(target_os = "macos")]
pub fn apply() {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    const PNG: &[u8] = include_bytes!("../icons/icon.png");

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    let data = NSData::with_bytes(PNG);
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };
    unsafe { app.setApplicationIconImage(Some(&image)) };
}

#[cfg(not(target_os = "macos"))]
pub fn apply() {}
