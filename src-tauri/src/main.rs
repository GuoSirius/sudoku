#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &Shortcut::new(Some(Modifiers::ALT), Code::Backquote) {
                        toggle_boss(app);
                    } else if shortcut == &Shortcut::new(Some(Modifiers::ALT), Code::KeyS) {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // 托盘右键菜单
            let show_i = MenuItem::with_id(app, "show", "显示 / 隐藏", true, None::<&str>)?;
            let boss_i = MenuItem::with_id(app, "boss", "老板键 (Alt + `)", true, None::<&str>)?;
            let mini_i = MenuItem::with_id(app, "mini", "切换迷你模式", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_i,
                    &boss_i,
                    &mini_i,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_i,
                ],
            )?;

            TrayIconBuilder::new()
                .tooltip("数独 Sudoku")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => toggle_window(app),
                    "boss" => toggle_boss(app),
                    "mini" => toggle_mini(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // 注册全局快捷键：Alt+` 老板键，Alt+S 显示/隐藏
            let shortcut_manager = app.global_shortcut();
            shortcut_manager
                .register(Shortcut::new(Some(Modifiers::ALT), Code::Backquote))
                .unwrap();
            shortcut_manager
                .register(Shortcut::new(Some(Modifiers::ALT), Code::KeyS))
                .unwrap();

            // 桌面端始终使用打包进 exe 的本地 web/ 资源（已在 tauri.conf.json 的
            // frontendDist 中嵌入），不依赖任何外部站点，保证离线可用、启动稳定。
            // 版本更新由 tauri-plugin-updater 负责（设置页「检查更新」）。

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 关闭按钮 → 最小化到托盘，不退出
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn toggle_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(true) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn toggle_boss<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("boss-toggle", ());
    }
}

fn toggle_mini<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("mini-toggle", ());
    }
}
