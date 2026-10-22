import Clutter from "gi://Clutter";
import type Meta from "gi://Meta";
import { isTargetWindow } from "../../utils/window-utils.js";

declare const global: {
    stage: Clutter.Stage;
    get_pointer: () => [number, number];
    get_window_actors: () => Meta.WindowActor[];
};

export class ClickHandler {
    private connected = false;

    constructor(
        private appClass: string,
        private onClickOutside: () => void,
    ) {}

    enable() {
        if (this.connected) return;
        global.stage.connectObject(
            "captured-event",
            (_stage: Clutter.Stage, event: Clutter.Event) => {
                if (event.type() === Clutter.EventType.BUTTON_PRESS)
                    this.handleClick();
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

    private handleClick() {
        const [x, y] = global.get_pointer();
        // Window actors are ordered bottom to top
        const clicked = global
            .get_window_actors()
            .map((actor) => actor.meta_window)
            .reverse()
            .find((win) => {
                if (!win || win.minimized) return false;
                const rect = win.get_frame_rect();
                return (
                    x >= rect.x &&
                    x < rect.x + rect.width &&
                    y >= rect.y &&
                    y < rect.y + rect.height
                );
            });

        if (!isTargetWindow(clicked, this.appClass)) this.onClickOutside();
    }
}
