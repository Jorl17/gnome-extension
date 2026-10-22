import { assert, test, waitFor } from "../lib/harness.js";
import { ExtensionState, extension, Windows } from "../lib/shell.js";

const exported = () => Array.isArray(Windows.json("List"));

test("disable unexports the D-Bus objects and enable restores them", () => {
    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    assert.throws(exported, "Windows object still exported after disable");
    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);
    waitFor("Windows object after re-enable", exported);
});

test("rapid disable/enable toggling leaves the extension active", () => {
    for (let i = 0; i < 5; i++) {
        extension.disable();
        extension.enable();
    }
    extension.waitForState(ExtensionState.ACTIVE);
    waitFor("Windows object after toggling", exported);
});
