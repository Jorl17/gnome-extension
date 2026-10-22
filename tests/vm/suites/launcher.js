import { assert, sleep, test, waitFor } from "../lib/harness.js";
import { clickAt } from "../lib/pointer.js";
import {
    closeRequests,
    openLauncher,
    openWindow,
    Windows,
    waitForCloseRequest,
    windowExists,
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

function closeWindow(id) {
    Windows.call("Close", "(u)", [id]);
    waitFor(`window ${id} to close`, () => !windowExists(id));
}

test("launcher windows are hidden from List", () => {
    other = openWindow("org.example.LauncherOther", "Other");
    launcher = openLauncher();
    assert.ok(
        Windows.json("List").every((w) => w.id !== launcher.id),
        "launcher window listed",
    );
});

test("a fixed-size launcher window is recognised whatever its title", () => {
    const translated = openLauncher(
        "Lanceur Vicinae",
        "org.example.vicinae.Fr",
    );
    assert.ok(
        Windows.json("List").every((w) => w.id !== translated.id),
        "translated launcher listed",
    );
    closeWindow(translated.id);
});

test("a resizable window of the launcher app is a normal window whatever its title", () => {
    const settings = openWindow(
        "org.example.vicinae.Settings",
        "Paramètres de Vicinae",
    );
    assert.ok(settings.id > 0, "settings window not listed");
    closeWindow(settings.id);
});

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

test("a launcher opened after the last one closed still gets close requests", () => {
    closeWindow(launcher.id);
    launcher = openLauncher("Launcher again");
    waitForCloseRequest(focusLauncherThenOther(), launcher.id);
    focus(launcher);
    const signals = Windows.watch();
    clickAt(EMPTY_DESKTOP.x, EMPTY_DESKTOP.y);
    waitForCloseRequest(signals, launcher.id);
});
