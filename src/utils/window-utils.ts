import type Meta from "gi://Meta";

export const getWindowById = (winid: number): Meta.Window | null => {
    if (!winid || winid <= 0) return null;

    try {
        const windowActors = global.get_window_actors();
        const actor = windowActors.find((w) => {
            try {
                return w.meta_window && w.meta_window.get_id() === winid;
            } catch {
                return false;
            }
        });
        return actor?.meta_window ?? null;
    } catch (_error) {
        return null;
    }
};

export const getCurrentWorkspace = () => {
    const workspaceManager = global.workspace_manager;
    return workspaceManager.get_active_workspace();
};

export const getCurrentMonitor = () => {
    return global.display.get_current_monitor();
};

export const getCurrentTime = () => {
    return global.get_current_time();
};

export const getFocusedWindow = (): Meta.Window | null => {
    const windowActors = global.get_window_actors();
    const actor = windowActors.find((w) => w.meta_window?.has_focus());
    return actor?.meta_window ?? null;
};

export const getFocusedWindowApp = () => {
    const focusedWindow = getFocusedWindow();
    if (focusedWindow) {
        const wmClass = focusedWindow.get_wm_class();
        const title = focusedWindow.get_title();

        return wmClass || title || "unknown";
    }
    return "gnome-shell";
};

interface LegacyMetaWindow extends Meta.Window {
    get_maximized?(): number;
}

/** GNOME 49 replaced get_maximized() and the direction flags with is_maximized(). */
const hasBooleanMaximize = (win: Meta.Window) =>
    typeof win.is_maximized === "function";

/** Meta.MaximizeFlags.BOTH, the maximize state and argument before GNOME 49. */
const MAXIMIZE_BOTH = 3;

/**
 * Starting from GNOME 49, the method is_maximized() is available on the Window object.
 * For older versions, we use get_maximized() instead, which returns direction flags.
 */
export const isMaximized = (win: Meta.Window): boolean | number => {
    if (hasBooleanMaximize(win)) {
        return win.is_maximized();
    }

    return (win as LegacyMetaWindow).get_maximized?.() ?? 0;
};

/** Whether the window is maximized in both directions, on any GNOME version. */
export const isFullyMaximized = (win: Meta.Window) => {
    const state = isMaximized(win);
    return state === true || state === MAXIMIZE_BOTH;
};

export const maximize = (win: Meta.Window) => {
    if (hasBooleanMaximize(win)) win.maximize();
    // @ts-expect-error - maximize() takes the directions before GNOME 49
    else win.maximize(MAXIMIZE_BOTH);
};

export const unmaximize = (win: Meta.Window) => {
    if (hasBooleanMaximize(win)) win.unmaximize();
    // @ts-expect-error - unmaximize() takes the directions before GNOME 49
    else win.unmaximize(MAXIMIZE_BOTH);
};

/**
 * Checks if a window is the Vicinae launcher window.
 * Matches wm_class; of those windows only the launcher has a fixed size, which
 * tells it apart from Settings without relying on its translated title.
 */
export const isTargetWindow = (
    window: Meta.Window | null | undefined,
    appClass: string = "vicinae",
): boolean => {
    if (!window) return false;

    const wmClass = window.get_wm_class();
    if (!wmClass) return false;

    const lowerWmClass = wmClass.toLowerCase();
    const lowerAppClass = appClass.toLowerCase();

    if (
        !lowerWmClass.includes(lowerAppClass) &&
        !lowerAppClass.includes(lowerWmClass)
    ) {
        return false;
    }

    return !window.allows_resize();
};
