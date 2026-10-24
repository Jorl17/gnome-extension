import type Meta from "gi://Meta";
import { logger } from "../../utils/logger.js";

/** Meta.Window properties whose changes alter the state reported by statewindow. */
const STATE_PROPERTIES = [
    "fullscreen",
    "minimized",
    "maximized-horizontally",
    "maximized-vertically",
];

/**
 * Manages per-window size and state signal connections.
 *
 * When a window's size or state changes, calls onSizeChanged or onStateChanged
 * so the owner can query the window and emit D-Bus signals.
 *
 * Clean up with disconnectAll() — iterates the active window list to find
 * and disconnect each tracked window's signals.
 */
export class WindowChangeTracker {
    private trackedWindows = new Set<number>();

    constructor(
        private onSizeChanged: (windowId: number) => void,
        private onStateChanged: (window: Meta.Window) => void,
    ) {}

    connectToWindow(window: Meta.Window): void {
        const windowId = window.get_id();

        if (this.trackedWindows.has(windowId)) {
            logger.debug(
                `Window ${windowId} already has change connections, skipping`,
            );
            return;
        }

        try {
            window.connectObject(
                "size-changed",
                () => {
                    try {
                        this.onSizeChanged(windowId);
                    } catch (error) {
                        logger.debug(
                            `Error in size-changed callback for window ${windowId}: ${error}`,
                        );
                    }
                },
                this,
            );
            for (const property of STATE_PROPERTIES) {
                window.connectObject(
                    `notify::${property}`,
                    () => {
                        try {
                            this.onStateChanged(window);
                        } catch (error) {
                            logger.debug(
                                `Error in state callback for window ${windowId}: ${error}`,
                            );
                        }
                    },
                    this,
                );
            }

            this.trackedWindows.add(windowId);
        } catch (error) {
            logger.debug(
                `Failed to connect change signals for window ${windowId}: ${error}`,
            );
        }
    }

    connectToExistingWindows(): void {
        try {
            const windowActors = global.get_window_actors();

            for (const actor of windowActors) {
                if (actor.meta_window) {
                    this.connectToWindow(actor.meta_window);
                }
            }
        } catch (error) {
            logger.debug(`Error connecting to existing windows: ${error}`);
        }
    }

    removeWindow(windowId: number): void {
        this.trackedWindows.delete(windowId);
    }

    disconnectAll(): void {
        for (const actor of global.get_window_actors()) {
            actor.meta_window?.disconnectObject(this);
        }

        this.trackedWindows.clear();
    }
}
