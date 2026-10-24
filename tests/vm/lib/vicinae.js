import Gio from "gi://Gio";
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

let server = null;

export function startVicinae(settings) {
    if (server) {
        server.force_exit();
        server.wait(null);
    }
    const dir = `${GLib.get_user_config_dir()}/vicinae`;
    GLib.mkdir_with_parents(dir, 0o755);
    GLib.file_set_contents(
        `${dir}/settings.json`,
        JSON.stringify({
            telemetry: { system_info: false },
            input_server: { enabled: false },
            ...settings,
        }),
    );
    const stateDir = `${GLib.get_user_state_dir()}/vicinae`;
    GLib.mkdir_with_parents(stateDir, 0o755);
    GLib.file_set_contents(
        `${stateDir}/onboarding.json`,
        JSON.stringify({ version: 1, completedAt: new Date().toISOString() }),
    );
    server = spawn([VICINAE, "server"], QT_ENV);
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

/** ClipboardOfferKind in Vicinae's clipboard-db.hpp */
export const OfferKind = { Text: 1, Link: 2, Image: 3, File: 4 };

/** Every offer in Vicinae's clipboard history, with the kind of its selection. */
export function clipboardHistory() {
    const db = `${GLib.get_user_data_dir()}/vicinae/clipboard.db`;
    if (!GLib.file_test(db, GLib.FileTest.EXISTS)) return [];
    const proc = Gio.Subprocess.new(
        [
            "sqlite3",
            "-readonly",
            "-json",
            db,
            `SELECT o.mime_type, o.content_hash_md5 AS md5, o.size, s.kind
             FROM data_offer o JOIN selection s ON s.id = o.selection_id`,
        ],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    );
    const [, out] = proc.communicate_utf8(null, null);
    return out?.trim() ? JSON.parse(out) : [];
}
