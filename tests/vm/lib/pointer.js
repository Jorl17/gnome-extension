import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { afterAll, sleep } from "./harness.js";

const BUS_NAME = "org.gnome.Mutter.RemoteDesktop";
const SESSION_IFACE = "org.gnome.Mutter.RemoteDesktop.Session";
const BTN_LEFT = 0x110;

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

function remoteDesktop() {
    if (session) return session;
    [session] = call(
        "/org/gnome/Mutter/RemoteDesktop",
        BUS_NAME,
        "CreateSession",
    );
    call(session, SESSION_IFACE, "Start");
    afterAll(() => {
        call(session, SESSION_IFACE, "Stop");
        session = null;
    });
    return session;
}

// Absolute motion needs a screencast stream, so move relative from the top-left corner instead
export function clickAt(x, y) {
    const path = remoteDesktop();
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
