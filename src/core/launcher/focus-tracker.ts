import GLib from "gi://GLib";
import type Meta from "gi://Meta";
import { logger } from "../../utils/logger.js";

declare const global: {
    display: Meta.Display;
};

export class FocusTracker {
    private connected = false;
    private focusIdleId = 0;

    constructor(private onFocusChange: () => void) {}

    enable() {
        if (this.connected) return;
        global.display.connectObject(
            "notify::focus-window",
            () => {
                if (this.focusIdleId) GLib.source_remove(this.focusIdleId);
                this.focusIdleId = GLib.idle_add(
                    GLib.PRIORITY_DEFAULT_IDLE,
                    () => {
                        this.focusIdleId = 0;
                        try {
                            this.onFocusChange();
                        } catch (error) {
                            logger.error(
                                "FocusTracker: Error in focus change handler",
                                error,
                            );
                        }
                        return GLib.SOURCE_REMOVE;
                    },
                );
            },
            this,
        );
        this.connected = true;
    }

    disable() {
        if (!this.connected) return;
        if (this.focusIdleId) {
            GLib.source_remove(this.focusIdleId);
            this.focusIdleId = 0;
        }
        global.display.disconnectObject(this);
        this.connected = false;
    }
}
