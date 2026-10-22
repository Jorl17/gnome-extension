import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { afterAll, Fatal, notYet, waitFor } from "./harness.js";

export const UUID = GLib.getenv("VM_TEST_UUID");
export const ROOT = GLib.getenv("VM_TEST_ROOT");
export const LOG = GLib.getenv("VM_TEST_LOG");

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
    return {
        call,
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

export function openWindow(appId, title) {
    const proc = Gio.Subprocess.new(
        ["gjs", "-m", `${ROOT}/tests/vm/lib/test-window.js`, appId, title],
        Gio.SubprocessFlags.NONE,
    );
    afterAll(() => proc.force_exit());
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
