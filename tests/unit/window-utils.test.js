import { afterEach, describe, expect, test } from "bun:test";
import {
    getFocusedWindowApp,
    getWindowById,
    isTargetWindow,
} from "../../src/utils/window-utils.ts";

const originalGlobal = globalThis.global;

afterEach(() => {
    globalThis.global = originalGlobal;
});

function fakeWindow({
    id = 1,
    wmClass = "org.example.App",
    title = "",
    resizable = true,
    focused = false,
} = {}) {
    return {
        get_id: () => id,
        get_wm_class: () => wmClass,
        get_title: () => title,
        allows_resize: () => resizable,
        has_focus: () => focused,
    };
}

function exposeWindows(...windows) {
    globalThis.global = {
        get_window_actors: () =>
            windows.map((meta_window) => ({ meta_window })),
    };
}

describe("isTargetWindow", () => {
    for (const [wmClass, appClass, resizable, expected] of [
        ["vicinae", "vicinae", false, true],
        ["Vicinae", "vicinae", false, true],
        ["org.example.vicinae", "vicinae", false, true],
        ["vicinae", "com.github.vicinae", false, true],
        ["vicinae", "vicinae", true, false],
        ["org.gnome.Nautilus", "vicinae", false, false],
        ["", "vicinae", false, false],
    ]) {
        test(`${expected ? "matches" : "skips"} ${JSON.stringify(wmClass)} for ${appClass}${resizable ? " when resizable" : ""}`, () => {
            expect(
                isTargetWindow(fakeWindow({ wmClass, resizable }), appClass),
            ).toBe(expected);
        });
    }

    test("skips a missing window", () => {
        expect(isTargetWindow(null)).toBe(false);
    });
});

describe("getWindowById", () => {
    test("finds the window with that id", () => {
        const wanted = fakeWindow({ id: 7 });
        exposeWindows(fakeWindow({ id: 3 }), wanted);
        expect(getWindowById(7)).toBe(wanted);
    });

    for (const id of [0, -1, 99]) {
        test(`returns null for id ${id}`, () => {
            exposeWindows(fakeWindow({ id: 3 }));
            expect(getWindowById(id)).toBeNull();
        });
    }
});

describe("getFocusedWindowApp", () => {
    test("names the focused window by class, then title", () => {
        exposeWindows(
            fakeWindow({ wmClass: "org.example.Other" }),
            fakeWindow({ wmClass: "org.gnome.Files", focused: true }),
        );
        expect(getFocusedWindowApp()).toBe("org.gnome.Files");

        exposeWindows(
            fakeWindow({ wmClass: "", title: "Untitled", focused: true }),
        );
        expect(getFocusedWindowApp()).toBe("Untitled");
    });

    test("is gnome-shell when no window has focus", () => {
        exposeWindows(fakeWindow());
        expect(getFocusedWindowApp()).toBe("gnome-shell");
    });
});
