import Gio from "gi://Gio";
import { assert, notYet, sleep, test, todo, waitFor } from "../lib/harness.js";
import { clickAt } from "../lib/pointer.js";
import {
    closeRequests,
    extensionSettings,
    MONITOR,
    openLauncher,
    openWindow,
    Windows,
    waitForCloseRequest,
} from "../lib/shell.js";

const EMPTY_DESKTOP = { x: 40, y: 80 };

let other;
let launcher;

const details = (id) => Windows.json("Details", "(u)", [id]);
const focusedId = () => JSON.parse(Windows.call("GetFocusedWindowSync"))?.id;

function focus(win) {
    Windows.call("Activate", "(u)", [win.id]);
    waitFor(`focus on ${win.id}`, () => details(win.id).has_focus);
}

function focusLauncherThenOther() {
    focus(launcher);
    const signals = Windows.watch();
    Windows.call("Activate", "(u)", [other.id]);
    return signals;
}

function setAutoClose(enabled) {
    extensionSettings().set_boolean("launcher-auto-close-focus-loss", enabled);
    Gio.Settings.sync();
    sleep(300);
}

test("launcher windows are hidden from List", () => {
    other = openWindow("org.example.LauncherOther", "Other");
    launcher = openLauncher();
    assert.ok(
        Windows.json("List").every((w) => w.id !== launcher.id),
        "launcher window listed",
    );
});

todo(
    "a new launcher window is centered on its monitor",
    "centering runs before the window has a size",
    () => {
        waitFor("launcher to be centered", () => {
            const d = details(launcher.id);
            const x = (MONITOR.width - d.width) / 2;
            const y = (MONITOR.height - d.height) / 2;
            return Math.abs(d.x - x) <= 2 && Math.abs(d.y - y) <= 2
                ? d
                : notYet(`at ${d.x},${d.y} size ${d.width}x${d.height}`);
        });
    },
);

test("focus loss requests closing the launcher without claiming it closed", () => {
    const signals = focusLauncherThenOther();
    waitForCloseRequest(signals, launcher.id);
    assert.ok(
        !signals.some(
            (s) =>
                s.name === "closewindow" && Number(s.args[0]) === launcher.id,
        ),
        "closewindow emitted for a window that is still open",
    );
});

test("the launcher is still tracked after a close request", () => {
    waitForCloseRequest(focusLauncherThenOther(), launcher.id);
});

test("clicking outside the launcher requests closing it", () => {
    focus(launcher);
    const signals = Windows.watch();
    clickAt(EMPTY_DESKTOP.x, EMPTY_DESKTOP.y);
    waitForCloseRequest(signals, launcher.id);
});

test("clicking inside the launcher does not request closing it", () => {
    focus(launcher);
    const d = details(launcher.id);
    const signals = Windows.watch();
    clickAt(d.x + d.width / 2, d.y + d.height / 2);
    sleep(500);
    assert.equal(closeRequests(signals, launcher.id), 0, "close requests");
});

test("GetFocusedWindowSync reports the previous window while the launcher has focus", () => {
    focus(launcher);
    const signals = Windows.watch();
    Windows.call("Activate", "(u)", [other.id]);
    waitFor("focuswindow for other window", () =>
        signals.some(
            (s) => s.name === "focuswindow" && Number(s.args[0]) === other.id,
        ),
    );
    focus(launcher);
    assert.equal(focusedId(), other.id, "focused window");
});

test("turning auto-close off stops close requests until it is turned on again", () => {
    setAutoClose(false);
    const off = focusLauncherThenOther();
    sleep(500);
    assert.equal(
        closeRequests(off, launcher.id),
        0,
        "close requests while off",
    );

    setAutoClose(true);
    waitForCloseRequest(focusLauncherThenOther(), launcher.id);
});
