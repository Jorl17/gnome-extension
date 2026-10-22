import GLib from "gi://GLib";
import { notYet, waitFor } from "./harness.js";
import {
    run,
    spawn,
    Windows,
    waitForSignalledWindow,
    windowExists,
} from "./shell.js";

export const VICINAE = GLib.find_program_in_path("vicinae");

const QT_ENV = { QT_QPA_PLATFORM: "wayland", QT_QUICK_BACKEND: "software" };

export const vicinae = (...args) => run([VICINAE, ...args]);

export function startVicinae(settings) {
    const dir = `${GLib.get_user_config_dir()}/vicinae`;
    GLib.mkdir_with_parents(dir, 0o755);
    GLib.file_set_contents(
        `${dir}/settings.json`,
        JSON.stringify({ telemetry: { system_info: false }, ...settings }),
    );
    spawn([VICINAE, "server", "--replace"], QT_ENV);
    waitFor("vicinae ping", () => vicinae("ping"), 30000);
}

export function openVicinae() {
    const signals = Windows.watch();
    vicinae("open");
    return waitForSignalledWindow(
        signals,
        (d) => d.wm_class.toLowerCase().includes("vicinae"),
        "vicinae window",
    );
}

export function waitForClosed(id) {
    waitFor(
        "vicinae window to close",
        () => !windowExists(id) || notYet("vicinae window still open"),
    );
}
