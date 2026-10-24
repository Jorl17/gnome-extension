import Gio from "gi://Gio";
import { afterAll, assert, sleep, test, waitFor } from "../lib/harness.js";
import {
    Clipboard,
    extensionSettings,
    openWindow,
    Windows,
} from "../lib/shell.js";

const BLOCKED = "org.example.ClipBlocked";

let normal;
let blocked;
let signals;

const details = (id) => Windows.json("Details", "(u)", [id]);

function focus(win) {
    Windows.call("Activate", "(u)", [win.id]);
    waitFor(`focus on ${win.id}`, () => details(win.id).has_focus);
}

function setBlocked(apps) {
    extensionSettings().set_strv("blocked-applications", apps);
    Gio.Settings.sync();
    sleep(300);
}

const uniqueText = () => `vicinae-vm-test-${Date.now()}-${Math.random()}`;

function reportedSince(before, text) {
    return () =>
        signals
            .slice(before)
            .some(
                (s) =>
                    s.name === "ClipboardChanged" &&
                    new TextDecoder().decode(new Uint8Array(s.args[0])) ===
                        text,
            );
}

function copy() {
    const text = uniqueText();
    const before = signals.length;
    Clipboard.call("SetContent", "(s)", [text]);
    return reportedSince(before, text);
}

test("SetContent round-trips through GetCurrentContent", () => {
    const text = `vicinae-vm-test-${Date.now()}`;
    Clipboard.call("SetContent", "(s)", [text]);
    waitFor(
        "clipboard content",
        () => Clipboard.call("GetCurrentContent") === text,
    );
});

test("ClipboardChanged reports copies once a client listens", () => {
    normal = openWindow("org.example.ClipNormal", "Normal");
    blocked = openWindow(BLOCKED, "Blocked");
    signals = Clipboard.watch();
    Clipboard.call("ListenToClipboardChanges");
    afterAll(() => {
        Clipboard.call("StopListening");
        setBlocked([]);
    });
    focus(normal);
    waitFor("ClipboardChanged", copy());
});

test("an empty blocked-applications entry does not block every app", () => {
    setBlocked(["", BLOCKED]);
    focus(normal);
    waitFor("ClipboardChanged from a non-blocked app", copy());
});

test("copies made while a blocked app is focused are not reported", () => {
    setBlocked([BLOCKED]);
    focus(blocked);
    const reported = copy();
    sleep(500);
    assert.ok(!reported(), "copy from a blocked app was reported");
});

// JetBrains IDEs on Wayland offer text only under charset-qualified and X11
// targets. SetContentBinary offers a single target, and only the selection
// path reports the raw text, so a match proves the offer was captured.
for (const mimeType of ["text/plain;charset=utf-8", "UTF8_STRING"]) {
    test(`text offered only as ${mimeType} is reported`, () => {
        setBlocked([]);
        focus(normal);
        const text = uniqueText();
        const before = signals.length;
        Clipboard.call("SetContentBinary", "(ays)", [
            new TextEncoder().encode(text),
            mimeType,
        ]);
        waitFor(
            `ClipboardChanged for ${mimeType}`,
            reportedSince(before, text),
        );
    });
}

const sameBytes = (a, b) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

function offer(bytes, mimeType) {
    const before = signals.length;
    Clipboard.call("SetContentBinary", "(ays)", [bytes, mimeType]);
    return before;
}

// The selection path is the only one that reports these exact bytes
function reportedAs(before, mimeType, bytes) {
    return () =>
        signals
            .slice(before)
            .some(
                (s) =>
                    s.name === "ClipboardChanged" &&
                    s.args[1] === mimeType &&
                    sameBytes(new Uint8Array(s.args[0]), bytes),
            );
}

test("an image copy is reported with its bytes and type", () => {
    focus(normal);
    const png = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        ...new TextEncoder().encode(uniqueText()),
    ]);
    const before = offer(png, "image/png");
    waitFor(
        "ClipboardChanged with the image",
        reportedAs(before, "image/png", png),
    );
});

test("a file copy is reported as a uri-list", () => {
    focus(normal);
    const uris = new TextEncoder().encode(
        `file:///tmp/${uniqueText()}.txt\nfile:///tmp/second.txt`,
    );
    const before = offer(uris, "text/uri-list");
    waitFor(
        "ClipboardChanged with the uri-list",
        reportedAs(before, "text/uri-list", uris),
    );
});

function setMonitoring(enabled) {
    extensionSettings().set_boolean("enable-clipboard-monitoring", enabled);
    Gio.Settings.sync();
    sleep(300);
}

test("copies are not reported while clipboard monitoring is off", () => {
    afterAll(() => setMonitoring(true));
    focus(normal);
    setMonitoring(false);
    const off = new TextEncoder().encode(uniqueText());
    const before = offer(off, "text/plain;charset=utf-8");
    sleep(500);
    assert.ok(
        !reportedAs(before, "text/plain", off)(),
        "copy was reported with monitoring off",
    );

    setMonitoring(true);
    const on = new TextEncoder().encode(uniqueText());
    const after = offer(on, "text/plain;charset=utf-8");
    waitFor(
        "ClipboardChanged once monitoring is back on",
        reportedAs(after, "text/plain", on),
    );
});

test("GetClipboardMimeTypes lists only types the extension reports", () => {
    const reported = [
        "text/plain",
        "text/html",
        "text/uri-list",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
    ];
    const unknown = Clipboard.call("GetClipboardMimeTypes").filter(
        (type) => !reported.includes(type),
    );
    assert.equal(unknown.join(", "), "", "advertised types it never reports");
});
