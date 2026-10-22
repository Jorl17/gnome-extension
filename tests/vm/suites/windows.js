import { assert, notYet, test, waitFor } from "../lib/harness.js";
import { openWindow, Windows } from "../lib/shell.js";

let a;
let b;

const details = (id) => Windows.json("Details", "(u)", [id]);
const frameRect = (id) => Windows.json("GetFrameRect", "(u)", [id]);
const focusedId = () => JSON.parse(Windows.call("GetFocusedWindowSync"))?.id;

function waitForFocus(id) {
    waitFor(`focus on ${id}`, () =>
        focusedId() === id ? true : notYet(`focused ${focusedId()}`),
    );
}

test("List returns opened windows with geometry", () => {
    a = openWindow("org.example.VmTestA", "VM Test A");
    b = openWindow("org.example.VmTestB", "VM Test B");
    for (const w of [a, b]) {
        assert.ok(w.id > 0, `invalid id ${w.id}`);
        assert.ok(w.height > 0, `invalid height ${w.height}`);
        assert.equal(typeof w.x, "number", "x type");
        assert.equal(typeof w.y, "number", "y type");
    }
});

test("a new window is not reported as maximized", () => {
    assert.equal(details(a.id).maximized, false, "maximized");
});

test("Details and GetTitle describe the window", () => {
    const d = details(a.id);
    assert.equal(d.id, a.id, "id");
    assert.equal(d.wm_class, "org.example.VmTestA", "wm_class");
    assert.equal(Windows.call("GetTitle", "(u)", [a.id]), "VM Test A", "title");
});

test("Details contains only plain JSON values", () => {
    const objects = Object.entries(details(a.id)).filter(
        ([, v]) => v !== null && typeof v === "object",
    );
    assert.equal(
        objects.map(([k]) => k).join(", "),
        "",
        "fields serialized from objects",
    );
});

test("GetFrameRect returns a positive rectangle", () => {
    const r = frameRect(a.id);
    assert.ok(r.width > 0 && r.height > 0, `bad rect ${JSON.stringify(r)}`);
});

test("GetFrameBounds returns serializable coordinates", () => {
    const { frame_bounds: bounds } = Windows.json("GetFrameBounds", "(u)", [
        a.id,
    ]);
    for (const key of ["x", "y", "width", "height"])
        assert.equal(typeof bounds?.[key], "number", `frame_bounds.${key}`);
});

test("Maximize and Unmaximize are reflected in Details", () => {
    Windows.call("Maximize", "(u)", [a.id]);
    waitFor("maximized", () => details(a.id).maximized === true);
    Windows.call("Unmaximize", "(u)", [a.id]);
    waitFor("unmaximized", () => details(a.id).maximized === false);
});

test("MoveResize applies the requested frame", () => {
    const target = { x: 100, y: 120, width: 520, height: 380 };
    Windows.call("MoveResize", "(uiiuu)", [a.id, ...Object.values(target)]);
    waitFor(`frame ${JSON.stringify(target)}`, () => {
        const r = frameRect(a.id);
        return Object.keys(target).every((k) => Math.abs(r[k] - target[k]) <= 2)
            ? r
            : notYet(JSON.stringify(r));
    });
});

test("Activate moves focus and GetFocusedWindowSync follows it", () => {
    for (const w of [a, b]) {
        Windows.call("Activate", "(u)", [w.id]);
        waitForFocus(w.id);
    }
});

test("Minimize drops focus and Unminimize restores the window", () => {
    Windows.call("Activate", "(u)", [b.id]);
    waitForFocus(b.id);
    Windows.call("Minimize", "(u)", [b.id]);
    waitFor("focus to leave minimized window", () => focusedId() !== b.id);
    Windows.call("Unminimize", "(u)", [b.id]);
    Windows.call("Activate", "(u)", [b.id]);
    waitForFocus(b.id);
});

test("ListWorkspaces and GetActiveWorkspace", () => {
    const list = Windows.json("ListWorkspaces");
    assert.ok(Array.isArray(list) && list.length > 0, "no workspaces");
    assert.equal(
        typeof Windows.json("GetActiveWorkspace")?.index,
        "number",
        "active workspace index",
    );
});

test("Close removes the window from List", () => {
    Windows.call("Close", "(u)", [b.id]);
    waitFor("window to close", () =>
        Windows.json("List").every((w) => w.id !== b.id),
    );
});
