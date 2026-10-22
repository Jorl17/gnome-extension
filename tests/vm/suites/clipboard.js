import { test, waitFor } from "../lib/harness.js";
import { Clipboard } from "../lib/shell.js";

test("SetContent round-trips through GetCurrentContent", () => {
    const text = `vicinae-vm-test-${Date.now()}`;
    Clipboard.call("SetContent", "(s)", [text]);
    waitFor(
        "clipboard content",
        () => Clipboard.call("GetCurrentContent") === text,
    );
});
