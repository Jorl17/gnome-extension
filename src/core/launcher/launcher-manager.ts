import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
import { logger } from "../../utils/logger.js";
import { isTargetWindow } from "../../utils/window-utils.js";
import type { WindowsService } from "../dbus/services/windows-service.js";
import { ClickHandler } from "./click-handler.js";
import { FocusTracker } from "./focus-tracker.js";
import { WindowTracker } from "./window-tracker.js";

declare const global: {
    display: Meta.Display;
};

/**
 * Asks the launcher to close when it loses focus or the user clicks outside it.
 * The request goes out as the `closerequested` D-Bus signal; hiding the window
 * is left to the launcher so its own state stays consistent.
 */
export class LauncherManager {
    private windowTracker: WindowTracker;
    private focusTracker: FocusTracker;
    private clickHandler: ClickHandler;

    constructor(
        private appClass: string,
        private onCloseRequested: (windowId: number) => void,
    ) {
        this.windowTracker = new WindowTracker(appClass, () =>
            this.syncClickHandler(),
        );
        this.focusTracker = new FocusTracker(() => this.handleFocusChange());
        this.clickHandler = new ClickHandler(() => this.requestClose());
    }

    static fromSettings(
        settings: Gio.Settings,
        windowsService: WindowsService,
    ): LauncherManager | null {
        if (!settings.get_boolean("launcher-auto-close-focus-loss"))
            return null;

        const appClass = settings.get_string("launcher-app-class") || "vicinae";
        const manager = new LauncherManager(appClass, (windowId) =>
            windowsService.emitCloseRequested(windowId.toString()),
        );
        manager.enable();
        return manager;
    }

    enable() {
        this.windowTracker.enable();
        this.focusTracker.enable();
        this.syncClickHandler();
        logger.info("LauncherManager: enabled");
    }

    disable() {
        this.clickHandler.disable();
        this.focusTracker.disable();
        this.windowTracker.disable();
        logger.info("LauncherManager: disabled");
    }

    private syncClickHandler() {
        if (this.windowTracker.size > 0) this.clickHandler.enable();
        else this.clickHandler.disable();
    }

    private handleFocusChange() {
        if (!isTargetWindow(global.display.get_focus_window(), this.appClass))
            this.requestClose();
    }

    private requestClose() {
        for (const windowId of this.windowTracker.windowIds) {
            logger.debug(`LauncherManager: requesting close of ${windowId}`);
            this.onCloseRequested(windowId);
        }
    }
}
