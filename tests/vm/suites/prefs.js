import { afterAll, assert, notYet, test, waitFor } from "../lib/harness.js";
import { extension, METADATA, Windows } from "../lib/shell.js";

const PREFS_APP_ID = "org.gnome.Shell.Extensions";

test("the preferences window opens", () => {
    extension.openPrefs();
    const win = waitFor(
        "preferences window",
        () => {
            const list = Windows.json("List");
            return (
                list.find((w) => w.wm_class === PREFS_APP_ID && w.width > 0) ??
                notYet(JSON.stringify(list.map((w) => w.wm_class)))
            );
        },
        20000,
    );
    afterAll(() => Windows.call("Close", "(u)", [win.id]));
    assert.ok(
        win.title.includes(METADATA.name),
        `unexpected title ${JSON.stringify(win.title)}`,
    );
});
