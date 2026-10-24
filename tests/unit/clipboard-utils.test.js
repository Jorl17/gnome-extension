import { afterEach, describe, expect, test } from "bun:test";
import {
    bufferLikeToUint8Array,
    calculateClipboardMetadata,
    decodeClipboardBytes,
    isFileUri,
    parseFileUris,
    toUriListFormat,
} from "../../src/utils/clipboard-utils.ts";

const originalGlobal = globalThis.global;

afterEach(() => {
    globalThis.global = originalGlobal;
});

// decodeClipboardBytes recognises GLib.Bytes by its constructor name
class FakeBytes {
    constructor(data) {
        this.data_ = data;
    }
    get_data() {
        return this.data_;
    }
}

describe("bufferLikeToUint8Array", () => {
    test("returns a Uint8Array unchanged", () => {
        const bytes = new Uint8Array([1, 2, 3]);
        expect(bufferLikeToUint8Array(bytes)).toBe(bytes);
    });

    test("copies an array-like buffer", () => {
        expect(bufferLikeToUint8Array([7, 8, 9])).toEqual(
            new Uint8Array([7, 8, 9]),
        );
    });

    test("rejects something that is not a buffer", () => {
        expect(() => bufferLikeToUint8Array(42)).toThrow(
            "Unsupported buffer type",
        );
    });
});

describe("decodeClipboardBytes", () => {
    test("reads GLib.Bytes through get_data()", () => {
        expect(decodeClipboardBytes(new FakeBytes([104, 105]))).toEqual(
            new Uint8Array([104, 105]),
        );
    });

    test("reads a plain object carrying data", () => {
        expect(decodeClipboardBytes({ data: [1, 2] })).toEqual(
            new Uint8Array([1, 2]),
        );
    });

    for (const value of [null, undefined, "text", 5, {}]) {
        test(`returns null for ${JSON.stringify(value)}`, () => {
            expect(decodeClipboardBytes(value)).toBeNull();
        });
    }
});

describe("isFileUri", () => {
    for (const [content, expected] of [
        ["file:///home/user/a.txt", true],
        ["file:///a\nfile:///b", true],
        ["file:///a\r\nfile:///b", true],
        ["  file:///a  \n", true],
        ["file:///a\nhttps://example.com", false],
        ["/home/user/a.txt", false],
        ["", false],
        ["   ", false],
    ]) {
        test(`is ${expected} for ${JSON.stringify(content)}`, () => {
            expect(isFileUri(content)).toBe(expected);
        });
    }
});

describe("parseFileUris", () => {
    test("keeps file URIs and drops comments, blank lines and other schemes", () => {
        expect(
            parseFileUris(
                "# copied by Files\nfile:///a\n\n  file:///b  \nhttps://x\r\n",
            ),
        ).toEqual(["file:///a", "file:///b"]);
    });
});

describe("toUriListFormat", () => {
    test("joins file URIs with newlines as UTF-8", () => {
        expect(
            new TextDecoder().decode(
                toUriListFormat(["file:///a", "https://x", "file:///b"]),
            ),
        ).toBe("file:///a\nfile:///b");
    });

    test("is empty when nothing is a file URI", () => {
        expect(toUriListFormat(["https://x"]).length).toBe(0);
    });
});

describe("calculateClipboardMetadata", () => {
    function focus(wmClass) {
        const window = {
            has_focus: () => true,
            get_wm_class: () => wmClass,
            get_title: () => "Window title",
        };
        globalThis.global = {
            get_window_actors: () => (wmClass ? [{ meta_window: window }] : []),
        };
    }

    for (const [content, source, mimeType] of [
        ["hello", "user", "text/plain"],
        ["<div>hello</div>", "user", "text/html"],
        ["a < b and c > d", "user", "text/plain"],
        ["file:///a\nfile:///b", "user", "text/uri-list"],
        ["data:application/json;base64,e30=", "user", "application/json"],
        ["data:image/jpeg;base64,AAAA", "image", "image/jpeg"],
    ]) {
        test(`reports ${mimeType} for ${JSON.stringify(content)}`, () => {
            focus("org.gnome.TextEditor");
            expect(
                calculateClipboardMetadata({ content, source }).mimeType,
            ).toBe(mimeType);
        });
    }

    test("names the focused window's class as the source app", () => {
        focus("org.gnome.TextEditor");
        expect(
            calculateClipboardMetadata({ content: "x", source: "user" })
                .sourceApp,
        ).toBe("org.gnome.TextEditor");
    });

    test("falls back to gnome-shell when no window has focus", () => {
        focus(null);
        expect(
            calculateClipboardMetadata({ content: "x", source: "user" })
                .sourceApp,
        ).toBe("gnome-shell");
    });
});
