import { afterEach, describe, expect, test } from "bun:test";
import { VicinaeWindowManager } from "../../src/core/windows/window-manager.ts";
import { isFullyMaximized } from "../../src/utils/window-utils.ts";

const originalGlobal = globalThis.global;
const manager = new VicinaeWindowManager("vicinae");
const activeWorkspace = {};

function exposeWindow(maximized = false, legacy = false) {
    const window = {
        get_id: () => 42,
        get_workspace: () => null,
        get_frame_rect: () => ({ x: 10, y: 20, width: 640, height: 480 }),
        get_title: () => "Test window",
        get_wm_class: () => "org.example.WindowTest",
        get_wm_class_instance: () => "",
        get_pid: () => 100,
        get_display: () => null,
        get_frame_type: () => 0,
        get_window_type: () => 0,
        get_layer: () => 0,
        get_monitor: () => 0,
        get_role: () => null,
        can_close: () => true,
        can_maximize: () => true,
        can_minimize: () => true,
        allows_move: () => true,
        allows_resize: () => true,
        has_focus: () => false,
        located_on_workspace: (workspace) => workspace === activeWorkspace,
        calls: [],
        maximize: (...args) => window.calls.push(["maximize", args]),
        unmaximize: (...args) => window.calls.push(["unmaximize", args]),
        move_resize_frame: (...args) =>
            window.calls.push(["move_resize_frame", args]),
        ...(legacy
            ? { get_maximized: () => maximized }
            : { is_maximized: () => maximized }),
    };
    globalThis.global = {
        get_window_actors: () => [{ meta_window: window }],
        workspace_manager: { get_active_workspace: () => null },
    };
    return window;
}

afterEach(() => {
    globalThis.global = originalGlobal;
});

describe("window D-Bus response data", () => {
    test("frame bounds contain serializable coordinates without get_frame_bounds", () => {
        exposeWindow();
        expect(JSON.parse(JSON.stringify(manager.getFrameBounds(42)))).toEqual({
            frame_bounds: { x: 10, y: 20, width: 640, height: 480 },
        });
    });

    test("frame bounds reject a missing window", () => {
        exposeWindow();
        expect(() => manager.getFrameBounds(99)).toThrow("Window not found");
    });

    test("in_current_workspace follows the active workspace", () => {
        exposeWindow();
        expect(manager.details(42).in_current_workspace).toBe(false);
        global.workspace_manager.get_active_workspace = () => activeWorkspace;
        expect(manager.details(42).in_current_workspace).toBe(true);
    });

    test("a missing title or role is sent as an empty string", () => {
        const window = exposeWindow();
        window.get_title = () => null;
        const details = manager.details(42);
        expect(details.title).toBe("");
        expect(details.role).toBe("");
    });

    for (const [value, legacy, expected] of [
        [false, false, false],
        [true, false, true],
        [0, true, false],
        [1, true, true],
        [3, true, true],
    ]) {
        test(`maximized is ${expected} for ${legacy ? "legacy flags" : "boolean"} ${value}`, () => {
            exposeWindow(value, legacy);
            expect(manager.details(42).maximized).toBe(expected);
        });
    }
});

describe("isFullyMaximized", () => {
    for (const [value, legacy, expected] of [
        [false, false, false],
        [true, false, true],
        [0, true, false],
        [1, true, false],
        [3, true, true],
    ]) {
        test(`is ${expected} for ${legacy ? "legacy flags" : "boolean"} ${value}`, () => {
            expect(isFullyMaximized(exposeWindow(value, legacy))).toBe(
                expected,
            );
        });
    }
});

describe("window D-Bus actions", () => {
    for (const [legacy, flags] of [
        [false, []],
        [true, [3]],
    ]) {
        const api = legacy ? "GNOME 48 and older" : "GNOME 49 and newer";

        test(`Maximize and Unmaximize use the ${api} signature`, () => {
            const window = exposeWindow(false, legacy);
            manager.maximize(42);
            manager.unmaximize(42);
            expect(window.calls).toEqual([
                ["maximize", flags],
                ["unmaximize", flags],
            ]);
        });

        test(`MoveResize unmaximizes a maximized window first on ${api}`, () => {
            const window = exposeWindow(legacy ? 3 : true, legacy);
            manager.moveResize(42, 1, 2, 300, 200);
            expect(window.calls).toEqual([
                ["unmaximize", flags],
                ["move_resize_frame", [true, 1, 2, 300, 200]],
            ]);
        });
    }
});
