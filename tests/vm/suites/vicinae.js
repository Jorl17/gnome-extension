import {
    assert,
    notYet,
    skip,
    sleep,
    test,
    todo,
    waitFor,
} from "../lib/harness.js";
import { clickAt } from "../lib/pointer.js";
import {
    closeRequests,
    MONITOR,
    openWindow,
    Windows,
    waitForCloseRequest,
} from "../lib/shell.js";
import {
    openVicinae,
    startVicinae,
    VICINAE,
    waitForClosed,
} from "../lib/vicinae.js";

const EMPTY_DESKTOP = { x: 40, y: 80 };

let launcher;
let other;

const details = (id) => Windows.json("Details", "(u)", [id]);

function focus(win) {
    Windows.call("Activate", "(u)", [win.id]);
    waitFor(`focus on ${win.id}`, () => details(win.id).has_focus);
}

if (!VICINAE) skip("vicinae is not installed in the VM");

test("vicinae server starts and answers ping", () => {
    startVicinae({ close_on_focus_loss: false });
});

test("vicinae open shows a launcher window hidden from List", () => {
    launcher = openVicinae();
    assert.equal(Windows.json("List").length, 0, "listed windows");
});

todo(
    "the vicinae window is centered on its monitor",
    "centering runs before the window has a size",
    () => {
        waitFor("vicinae to be centered", () => {
            const d = details(launcher.id);
            const x = (MONITOR.width - d.width) / 2;
            const y = (MONITOR.height - d.height) / 2;
            return Math.abs(d.x - x) <= 2 && Math.abs(d.y - y) <= 2
                ? d
                : notYet(`at ${d.x},${d.y} size ${d.width}x${d.height}`);
        });
    },
);

test("clicking the empty desktop requests closing vicinae", () => {
    const signals = Windows.watch();
    clickAt(EMPTY_DESKTOP.x, EMPTY_DESKTOP.y);
    waitForCloseRequest(signals, launcher.id);
});

test("clicking the vicinae search bar does not request closing it", () => {
    const d = details(launcher.id);
    const signals = Windows.watch();
    clickAt(d.x + d.width / 2, d.y + 24);
    sleep(500);
    assert.equal(closeRequests(signals, launcher.id), 0, "close requests");
});

todo(
    "vicinae hides when the extension requests it",
    "Vicinae does not handle closerequested yet",
    () => waitForClosed(launcher.id),
);

test("focus loss requests closing vicinae", () => {
    other = openWindow("org.example.FocusTarget", "Focus target");
    focus(launcher);
    const signals = Windows.watch();
    Windows.call("Activate", "(u)", [other.id]);
    waitForCloseRequest(signals, launcher.id);
});

test("vicinae's own close_on_focus_loss closes it when another window takes focus", () => {
    startVicinae({ close_on_focus_loss: true });
    const win = openVicinae();
    Windows.call("Activate", "(u)", [other.id]);
    waitForClosed(win.id);
});
