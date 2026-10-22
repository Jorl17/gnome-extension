import Gio from "gi://Gio";
import GLib from "gi://GLib";
import System from "system";
import { setActiveSuite, waitFor } from "./lib/harness.js";
import {
    ExtensionState,
    extension,
    LOG,
    METADATA,
    ROOT,
    UUID,
    Windows,
} from "./lib/shell.js";

const SUITES_DIR = `${ROOT}/tests/vm/suites`;
const filters = (GLib.getenv("VM_TEST_FILTER") ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

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

function newExtensionErrors(allowed = []) {
    const [, bytes] = GLib.file_get_contents(LOG);
    const lines = new TextDecoder().decode(bytes).split("\n");
    const fresh = lines.slice(logLinesSeen);
    logLinesSeen = lines.length;
    return fresh.filter((line, i) => {
        if (!/JS ERROR|Unhandled promise rejection|ERROR:|CRITICAL/.test(line))
            return false;
        const context = fresh.slice(i, i + 6).join("\n");
        if (allowed.some((p) => p.test(fresh.slice(i, i + 3).join("\n"))))
            return false;
        return context.includes(UUID) || context.includes(`[${METADATA.name}]`);
    });
}

const matches = (suite, testName) =>
    filters.length === 0 ||
    filters.some(
        (f) =>
            suite.toLowerCase().includes(f) ||
            testName.toLowerCase().includes(f),
    );

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
let todos = 0;

for (const file of suiteFiles()) {
    const name = file.replace(/\.js$/, "");
    const suite = { tests: [], cleanups: [], allowedLogs: [] };
    setActiveSuite(suite);
    try {
        await import(`file://${SUITES_DIR}/${file}`);
    } catch (e) {
        print(name);
        failed++;
        fail(`could not load suite\n${e}`);
        continue;
    }

    if (suite.skipped) {
        if (matches(name, "")) print(`${name} (skipped: ${suite.skipped})`);
        continue;
    }

    const selected = suite.tests.filter((t) => matches(name, t.name));
    if (selected.length === 0) continue;

    print(name);
    newExtensionErrors();
    for (const { name: testName, fn, todo } of selected) {
        try {
            await fn();
            if (todo) {
                failed++;
                fail(`${testName}\npasses now; turn this todo into a test`);
            } else {
                passed++;
                print(`  ✓ ${testName}`);
            }
        } catch (e) {
            if (todo) {
                todos++;
                print(`  ○ ${testName} (todo: ${todo})`);
            } else {
                failed++;
                fail(`${testName}\n${e.message}`);
            }
        }
    }
    for (const cleanup of suite.cleanups) {
        try {
            cleanup();
        } catch (e) {
            print(`  ! cleanup failed: ${e.message}`);
        }
    }

    const errors = newExtensionErrors(suite.allowedLogs);
    if (errors.length > 0) {
        failed++;
        fail(`extension logged errors\n${errors.join("\n")}`);
    }
}

if (passed + failed + todos === 0)
    print(`No tests match "${filters.join(" ")}"`);
print(`\n${passed} passed, ${failed} failed${todos ? `, ${todos} todo` : ""}`);
System.exit(failed > 0 || passed === 0 ? 1 : 0);
