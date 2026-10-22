import GLib from "gi://GLib";

export class Fatal extends Error {}

export function notYet(detail) {
    throw new Error(detail);
}

export function sleep(ms) {
    GLib.usleep(ms * 1000);
}

export function waitFor(description, predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
        try {
            const value = predicate();
            if (value) return value;
            last = value;
        } catch (e) {
            if (e instanceof Fatal) throw e;
            last = e.message;
        }
        sleep(100);
    }
    throw new Error(`Timed out waiting for ${description} (last: ${last})`);
}

export const assert = {
    ok(condition, message) {
        if (!condition) throw new Error(message);
    },
    equal(actual, expected, label) {
        if (actual !== expected)
            throw new Error(
                `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
            );
    },
    throws(fn, message) {
        try {
            fn();
        } catch {
            return;
        }
        throw new Error(message);
    },
};

let active = null;

export function setActiveSuite(suite) {
    active = suite;
}

export function test(name, fn) {
    active.tests.push({ name, fn });
}

export function afterAll(fn) {
    active.cleanups.push(fn);
}
