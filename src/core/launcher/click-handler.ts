import Clutter from "gi://Clutter";

declare const global: {
    stage: Clutter.Stage;
};

/**
 * Reports clicks that land outside every application window. Clicks on a
 * window are delivered straight to its client and never reach the stage, so
 * any button press seen here is outside the launcher.
 */
export class ClickHandler {
    private connected = false;

    constructor(private onClickOutside: () => void) {}

    enable() {
        if (this.connected) return;
        global.stage.connectObject(
            "captured-event",
            (_stage: Clutter.Stage, event: Clutter.Event) => {
                if (event.type() === Clutter.EventType.BUTTON_PRESS)
                    this.onClickOutside();
                return Clutter.EVENT_PROPAGATE;
            },
            this,
        );
        this.connected = true;
    }

    disable() {
        if (!this.connected) return;
        global.stage.disconnectObject(this);
        this.connected = false;
    }
}
