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

/** Meta.Window before GNOME 49, whose maximize API took and returned Meta.MaximizeFlags. */
interface LegacyMetaWindow extends Meta.Window {
    get_maximized(): number;
    maximize(directions?: number): void;
    unmaximize(directions?: number): void;
}

/** GNOME 49 replaced get_maximized() and the direction flags with is_maximized(). */
const isLegacyWindow = (win: Meta.Window): win is LegacyMetaWindow =>
    typeof win.is_maximized !== "function";

/** Meta.MaximizeFlags.BOTH, the maximize state and argument before GNOME 49. */
const MAXIMIZE_BOTH = 3;

/**
 * Starting from GNOME 49, the method is_maximized() is available on the Window object.
 * For older versions, we use get_maximized() instead, which returns direction flags.
 */
export const isMaximized = (win: Meta.Window): boolean | number =>
    isLegacyWindow(win) ? win.get_maximized() : win.is_maximized();

/** Whether the window is maximized in both directions, on any GNOME version. */
export const isFullyMaximized = (win: Meta.Window) => {
    const state = isMaximized(win);
    return state === true || state === MAXIMIZE_BOTH;
};

/** The window state the statewindow signal reports. */
export const getWindowState = (win: Meta.Window) => {
    if (win.is_fullscreen()) return "fullscreen";
    if (win.minimized) return "minimized";
    if (isFullyMaximized(win)) return "maximized";
    return "normal";
};

export const maximize = (win: Meta.Window) => {
    if (isLegacyWindow(win)) win.maximize(MAXIMIZE_BOTH);
    else win.maximize();
};

export const unmaximize = (win: Meta.Window) => {
    if (isLegacyWindow(win)) win.unmaximize(MAXIMIZE_BOTH);
    else win.unmaximize();
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
