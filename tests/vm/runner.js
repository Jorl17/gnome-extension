import Gio from "gi://Gio";
import GLib from "gi://GLib";
import System from "system";
import { setActiveSuite, waitFor } from "./lib/harness.js";
import {
    ExtensionState,
    extension,
    LOG,
    ROOT,
    UUID,
    Windows,
} from "./lib/shell.js";

const SUITES_DIR = `${ROOT}/tests/vm/suites`;
const filter = (GLib.getenv("VM_TEST_FILTER") ?? "").trim().toLowerCase();
const [, metadataBytes] = GLib.file_get_contents(`${ROOT}/metadata.json`);
const { name: extensionName } = JSON.parse(
    new TextDecoder().decode(metadataBytes),
);

function suiteFiles() {
    const files = [];
    const enumerator = Gio.File.new_for_path(SUITES_DIR).enumerate_children(
        "standard::name",
        Gio.FileQueryInfoFlags.NONE,
        null,
    );
    for (const info of enumerator) {
        if (info.get_name().endsWith(".js")) files.push(info.get_name());
    }
    return files.sort();
}

let logLinesSeen = 0;

function newExtensionErrors() {
    const [, bytes] = GLib.file_get_contents(LOG);
    const lines = new TextDecoder().decode(bytes).split("\n");
    const fresh = lines.slice(logLinesSeen);
    logLinesSeen = lines.length;
    return fresh.filter((line, i) => {
        if (!/JS ERROR|Unhandled promise rejection|ERROR:|CRITICAL/.test(line))
            return false;
        const context = fresh.slice(i, i + 6).join("\n");
        return context.includes(UUID) || context.includes(`[${extensionName}]`);
    });
}

const matches = (suite, testName) =>
    !filter ||
    suite.toLowerCase().includes(filter) ||
    testName.toLowerCase().includes(filter);

function fail(message) {
    print(`  ✗ ${message.replace(/\n/g, "\n      ")}`);
}

try {
    extension.waitForState(ExtensionState.ACTIVE, 30000);
    waitFor("D-Bus objects to be exported", () => Windows.json("List"), 10000);
} catch (e) {
    print(`Extension did not come up: ${e.message}`);
    System.exit(1);
}

let passed = 0;
let failed = 0;

for (const file of suiteFiles()) {
    const name = file.replace(/\.js$/, "");
    const suite = { tests: [], cleanups: [] };
    setActiveSuite(suite);
    try {
        await import(`file://${SUITES_DIR}/${file}`);
    } catch (e) {
        print(name);
        failed++;
        fail(`could not load suite\n${e}`);
        continue;
    }

    const selected = suite.tests.filter((t) => matches(name, t.name));
    if (selected.length === 0) continue;

    print(name);
    newExtensionErrors();
    for (const { name: testName, fn } of selected) {
        try {
            await fn();
            passed++;
            print(`  ✓ ${testName}`);
        } catch (e) {
            failed++;
            fail(`${testName}\n${e.message}`);
        }
    }
    for (const cleanup of suite.cleanups) {
        try {
            cleanup();
        } catch (e) {
            print(`  ! cleanup failed: ${e.message}`);
        }
    }

    const errors = newExtensionErrors();
    if (errors.length > 0) {
        failed++;
        fail(`extension logged errors\n${errors.join("\n")}`);
    }
}

if (passed + failed === 0) print(`No tests match "${filter}"`);
print(`\n${passed} passed, ${failed} failed`);
System.exit(failed > 0 || passed === 0 ? 1 : 0);
