import type Meta from "gi://Meta";
import { logger } from "../../utils/logger.js";
import { isTargetWindow } from "../../utils/window-utils.js";

declare const global: {
    display: Meta.Display;
    window_manager: {
        connectObject: (...args: unknown[]) => void;
        disconnectObject: (...args: unknown[]) => void;
    };
    get_window_actors: () => Meta.WindowActor[];
};

export class WindowTracker {
    private trackedWindows = new Set<number>();
    private pendingWindows = new Set<Meta.Window>();

    constructor(
        private appClass: string,
        private onChange: () => void,
    ) {}

    get size(): number {
        return this.trackedWindows.size;
    }

    get windowIds(): number[] {
        return Array.from(this.trackedWindows);
    }

    enable() {
        try {
            global.display.connectObject(
                "window-created",
                (_display: Meta.Display, window: Meta.Window) =>
                    this.waitUntilShown(window),
                this,
            );

            global.window_manager.connectObject(
                "destroy",
                (_wm: unknown, actor: unknown) => {
                    try {
                        const metaWindow = (actor as Meta.WindowActor)
                            ?.meta_window;
                        const windowId = metaWindow?.get_id();
                        if (windowId && this.trackedWindows.has(windowId)) {
                            this.trackedWindows.delete(windowId);
                            this.onChange();
                            logger.debug(
                                `WindowTracker: Untracking destroyed window ${windowId}`,
                            );
                        }
                    } catch {
                        // Window already gone, safe to ignore
                    }
                },
                this,
            );

            this.scanExistingWindows();
            logger.info("WindowTracker: Window tracking enabled");
        } catch (error) {
            logger.error(
                "WindowTracker: Error enabling window tracking",
                error,
            );
            throw error;
        }
    }

    disable() {
        global.display.disconnectObject(this);
        global.window_manager.disconnectObject(this);

        for (const window of this.pendingWindows) window.disconnectObject(this);
        this.pendingWindows.clear();

        this.trackedWindows.clear();
        logger.info("WindowTracker: Window tracking disabled");
    }

    // A window's size hints, which tell the launcher apart, are only reliable once it is shown
    private waitUntilShown(window: Meta.Window) {
        const settle = () => {
            window.disconnectObject(this);
            this.pendingWindows.delete(window);
        };
        this.pendingWindows.add(window);
        window.connectObject(
            "shown",
            () => {
                settle();
                this.handleNewWindow(window);
            },
            "unmanaged",
            settle,
            this,
        );
    }

    private scanExistingWindows() {
        try {
            const windowActors = global.get_window_actors();
            logger.debug(
                `WindowTracker: Scanning ${windowActors.length} existing windows`,
            );

            windowActors.forEach((actor: Meta.WindowActor) => {
                if (actor?.meta_window) {
                    this.handleNewWindow(actor.meta_window);
                } else {
                    logger.debug(
                        "WindowTracker: Skipping invalid window actor",
                    );
                }
            });
        } catch (error) {
            logger.error(
                "WindowTracker: Error scanning existing windows",
                error,
            );
        }
    }

    private handleNewWindow(window: Meta.Window) {
        try {
            const wmClass = window.get_wm_class();
            const title = window.get_title();
            const windowId = window.get_id();

            if (!wmClass || !title || windowId <= 0) {
                return;
            }

            if (isTargetWindow(window, this.appClass)) {
                if (!this.trackedWindows.has(windowId)) {
                    this.trackedWindows.add(windowId);
                    this.onChange();

                    logger.debug(
                        `WindowTracker: Tracking new window ${windowId} (${wmClass})`,
                    );
                }
            }
        } catch (error) {
            logger.error("WindowTracker: Error handling new window", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
        }
    }
}
