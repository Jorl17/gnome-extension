import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { sleep } from "./harness.js";

const BUS_NAME = "org.gnome.Mutter.RemoteDesktop";
const SESSION_IFACE = "org.gnome.Mutter.RemoteDesktop.Session";
const BTN_LEFT = 0x110;
const XK_SHIFT_L = 0xffe1;

let session = null;

function call(path, iface, method, signature = null, args = []) {
    return Gio.DBus.session
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
        .recursiveUnpack();
}

// The session's virtual keyboard and pointer give the headless seat the input
// devices a real desktop has; it stays up for the whole run
export function startInputDevices() {
    if (session) return session;
    [session] = call(
        "/org/gnome/Mutter/RemoteDesktop",
        BUS_NAME,
        "CreateSession",
    );
    call(session, SESSION_IFACE, "Start");
    // Mutter creates the virtual devices on their first event
    for (const pressed of [true, false])
        call(session, SESSION_IFACE, "NotifyKeyboardKeysym", "(ub)", [
            XK_SHIFT_L,
            pressed,
        ]);
    call(session, SESSION_IFACE, "NotifyPointerMotionRelative", "(dd)", [1, 0]);
    return session;
}

// Absolute motion needs a screencast stream, so move relative from the top-left corner instead
export function clickAt(x, y) {
    const path = startInputDevices();
    const move = (dx, dy) =>
        call(path, SESSION_IFACE, "NotifyPointerMotionRelative", "(dd)", [
            dx,
            dy,
        ]);
    move(-100000, -100000);
    move(x, y);
    // A small extra motion makes Mutter re-pick the surface under the pointer before the press
    sleep(100);
    move(1, 0);
    move(-1, 0);
    sleep(150);
    for (const pressed of [true, false]) {
        call(path, SESSION_IFACE, "NotifyPointerButton", "(ib)", [
            BTN_LEFT,
            pressed,
        ]);
        sleep(50);
    }
}

// Presses the keys in order and releases them in reverse, like a shortcut. Clients only
// take the clipboard in response to input, so tests that copy from a client press keys.
export function pressKeys(...keysyms) {
    const path = startInputDevices();
    const notify = (keysym, pressed) => {
        call(path, SESSION_IFACE, "NotifyKeyboardKeysym", "(ub)", [
            keysym,
            pressed,
        ]);
        sleep(50);
    };
    for (const keysym of keysyms) notify(keysym, true);
    for (const keysym of keysyms.toReversed()) notify(keysym, false);
}
