import { logger } from "../../utils/logger.js";
import { isTargetWindow } from "../../utils/window-utils.js";
import { ClickHandler } from "./click-handler.js";
import { FocusTracker } from "./focus-tracker.js";
import { WindowTracker } from "./window-tracker.js";

/**
 * Asks the launcher to close when it loses focus or the user clicks outside it.
 * The request goes out as the `closerequested` D-Bus signal; the launcher
 * decides whether to hide, so its own settings and state stay in charge.
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
            this.syncListeners(),
        );
        this.focusTracker = new FocusTracker(() => this.handleFocusChange());
        this.clickHandler = new ClickHandler(appClass, () =>
            this.requestClose(),
        );
    }

    enable() {
        this.windowTracker.enable();
        this.syncListeners();
        logger.info("LauncherManager: enabled");
    }

    disable() {
        this.clickHandler.disable();
        this.focusTracker.disable();
        this.windowTracker.disable();
        logger.info("LauncherManager: disabled");
    }

    private syncListeners() {
        if (this.windowTracker.size > 0) {
            this.focusTracker.enable();
            this.clickHandler.enable();
        } else {
            this.clickHandler.disable();
            this.focusTracker.disable();
        }
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
