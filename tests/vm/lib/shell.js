import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { afterAll, allowLogged, Fatal, notYet, waitFor } from "./harness.js";

export const UUID = GLib.getenv("VM_TEST_UUID");
export const ROOT = GLib.getenv("VM_TEST_ROOT");
export const LOGS = [
    GLib.getenv("VM_TEST_LOG"),
    `${GLib.getenv("VM_TEST_WORK")}/session.log`,
];
export const METADATA = JSON.parse(
    new TextDecoder().decode(
        GLib.file_get_contents(`${ROOT}/metadata.json`)[1],
    ),
);

const BUS_NAME = "org.gnome.Shell";

function service(path, iface) {
    const call = (method, signature = null, args = []) =>
        Gio.DBus.session
            .call_sync(
                BUS_NAME,
                path,
                iface,
                method,
                signature ? new GLib.Variant(signature, args) : null,
                null,
                Gio.DBusCallFlags.NONE,
                5000,
                null,
            )
            .recursiveUnpack()[0];
    const watch = () => {
        const signals = [];
        const id = Gio.DBus.session.signal_subscribe(
            BUS_NAME,
            iface,
            null,
            path,
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, name, params) =>
                signals.push({ name, args: params.recursiveUnpack() }),
        );
        afterAll(() => Gio.DBus.session.signal_unsubscribe(id));
        return signals;
    };
    return {
        call,
        watch,
        json: (method, signature, args) =>
            JSON.parse(call(method, signature, args)),
    };
}

export const Windows = service(
    "/org/gnome/Shell/Extensions/Windows",
    "org.gnome.Shell.Extensions.Windows",
);

export const Clipboard = service(
    "/org/gnome/Shell/Extensions/Clipboard",
    "org.gnome.Shell.Extensions.Clipboard",
);

const Extensions = service("/org/gnome/Shell", "org.gnome.Shell.Extensions");

export const ExtensionState = {
    ACTIVE: 1,
    INACTIVE: 2,
    ERROR: 3,
    OUT_OF_DATE: 4,
};

export const extension = {
    info: () => Extensions.call("GetExtensionInfo", "(s)", [UUID]),
    enable: () => Extensions.call("EnableExtension", "(s)", [UUID]),
    disable: () => Extensions.call("DisableExtension", "(s)", [UUID]),
    openPrefs: () =>
        Extensions.call("OpenExtensionPrefs", "(ssa{sv})", [UUID, "", {}]),
    waitForState(state, timeoutMs = 5000) {
        const seen = [];
        return waitFor(
            `extension state ${state}`,
            () => {
                const info = extension.info();
                if (seen.at(-1) !== info.state) seen.push(info.state);
                // loadExtension() reports ERROR while loading; it is final only once an error is attached
                if (
                    (info.state === ExtensionState.ERROR && info.error) ||
                    info.state === ExtensionState.OUT_OF_DATE
                )
                    throw new Fatal(
                        `extension failed to load (states: ${seen.join(" → ")}): ${info.error}`,
                    );
                return info.state === state
                    ? info
                    : notYet(`state ${info.state}`);
            },
            timeoutMs,
        );
    },
};

export const LAUNCHER_APP_ID = "org.example.vicinae";

export function spawn(argv, env = {}) {
    const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.NONE,
    });
    for (const [key, value] of Object.entries(env))
        launcher.setenv(key, value, true);
    const proc = launcher.spawnv(argv);
    afterAll(() => proc.force_exit());
    return proc;
}

export function run(argv) {
    return Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    ).wait_check(null);
}

const spawnWindow = (appId, title) =>
    spawn(["gjs", "-m", `${ROOT}/tests/vm/lib/test-window.js`, appId, title]);

// Launcher windows are hidden from List, so they are found through the ids carried by signals
export function waitForSignalledWindow(signals, matches, description) {
    return waitFor(
        description,
        () => {
            const ids = new Set(
                signals
                    .filter((s) =>
                        ["openwindow", "focuswindow"].includes(s.name),
                    )
                    .map((s) => Number(s.args[0])),
            );
            for (const id of ids) {
                try {
                    const d = Windows.json("Details", "(u)", [id]);
                    if (d.width > 0 && matches(d)) return d;
                } catch {}
            }
            return notYet(`window ids seen: ${[...ids].join(", ")}`);
        },
        10000,
    );
}

export function openLauncher(title = "Launcher") {
    const signals = Windows.watch();
    spawnWindow(LAUNCHER_APP_ID, title);
    return waitForSignalledWindow(
        signals,
        (d) => d.wm_class === LAUNCHER_APP_ID,
        "launcher window",
    );
}

export function openWindow(appId, title) {
    spawnWindow(appId, title);
    return waitFor(
        `window ${appId}`,
        () => {
            const list = Windows.json("List");
            return (
                list.find((w) => w.wm_class === appId && w.width > 0) ??
                notYet(JSON.stringify(list.map((w) => w.wm_class)))
            );
        },
        10000,
    );
}

export function windowExists(id) {
    allowLogged(/Window not found/);
    try {
        Windows.call("Details", "(u)", [id]);
        return true;
    } catch {
        return false;
    }
}

export function extensionSettings() {
    const source = Gio.SettingsSchemaSource.new_from_directory(
        `${GLib.get_user_data_dir()}/gnome-shell/extensions/${UUID}/schemas`,
        Gio.SettingsSchemaSource.get_default(),
        false,
    );
    return new Gio.Settings({
        settings_schema: source.lookup(METADATA["settings-schema"], false),
    });
}

export const closeRequests = (signals, id) =>
    signals.filter(
        (s) => s.name === "closerequested" && Number(s.args[0]) === id,
    ).length;

export function waitForCloseRequest(signals, id) {
    waitFor(`closerequested for ${id}`, () => closeRequests(signals, id) > 0);
}
