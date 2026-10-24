import St from "gi://St";
import { describe, expect, test } from "bun:test";
import { BinaryDataStore } from "../../src/core/clipboard/binary-data-store.ts";
import {
    FileHandler,
    ImageHandler,
    TextHandler,
} from "../../src/core/clipboard/handlers/index.ts";

const encode = (text) => new TextEncoder().encode(text);
const decode = (bytes) => new TextDecoder().decode(bytes);

class FakeBytes {
    constructor(data) {
        this.data_ = data;
    }
    get_data() {
        return this.data_;
    }
}

/** St.Clipboard that answers with `text` and `contents[mimeType]`, and records writes. */
function fakeClipboard({ text = null, contents = {} } = {}) {
    const clipboard = {
        requested: [],
        written: [],
        get_text: (_type, callback) => callback(clipboard, text),
        get_content: (_type, mimeType, callback) => {
            clipboard.requested.push(mimeType);
            const data = contents[mimeType];
            callback(clipboard, data ? new FakeBytes(data) : null);
        },
        set_text: (type, value) =>
            clipboard.written.push([type, "text", value]),
        set_content: (type, mimeType, bytes) =>
            clipboard.written.push([type, mimeType, decode(bytes)]),
    };
    return clipboard;
}

function capture(handler, clipboard, context) {
    const results = [];
    handler.capture(clipboard, (content) => results.push(content), context);
    return results;
}

describe("TextHandler", () => {
    const handler = new TextHandler();

    describe("accepts the text targets St.Clipboard.get_text() reads", () => {
        for (const types of [
            ["text/plain"],
            ["text/plain;charset=utf-8"],
            ["TEXT/PLAIN;CHARSET=UTF-8"],
            ["UTF8_STRING"],
            ["STRING"],
            // JetBrains IDEs on Wayland: no bare text/plain (issue #35)
            [
                "JAVA_DATATRANSFER_COOKIE_1",
                "text/plain;charset=unicode",
                "text/plain;charset=UTF-8",
                "UTF8_STRING",
                "STRING",
                "TEXT",
            ],
            [],
        ]) {
            test(JSON.stringify(types), () => {
                expect(handler.matchesMimeTypes(types)).toBe(true);
            });
        }
    });

    describe("rejects offers without text", () => {
        for (const types of [
            ["image/png"],
            ["text/uri-list"],
            ["text/html"],
            ["text/plainish"],
            ["application/x-vicinae-concealed"],
        ]) {
            test(JSON.stringify(types), () => {
                expect(handler.matchesMimeTypes(types)).toBe(false);
            });
        }
    });

    test("does not claim binary markers as text", () => {
        expect(handler.matchesContent("hello")).toBe(true);
        expect(handler.matchesContent("[BINARY_IMAGE:image/png:3]")).toBe(
            false,
        );
        expect(handler.matchesContent("[BINARY_DATA:x:3]")).toBe(false);
    });

    test("captures the clipboard text", () => {
        expect(capture(handler, fakeClipboard({ text: "copied" }))).toEqual([
            "copied",
        ]);
    });

    test("ignores an empty clipboard", () => {
        expect(capture(handler, fakeClipboard({ text: null }))).toEqual([]);
        expect(capture(handler, fakeClipboard({ text: "" }))).toEqual([]);
    });

    test("sets both the clipboard and the primary selection", () => {
        const clipboard = fakeClipboard();
        expect(handler.set(clipboard, "pasted")).toBe(true);
        expect(clipboard.written).toEqual([
            [St.ClipboardType.CLIPBOARD, "text", "pasted"],
            [St.ClipboardType.PRIMARY, "text", "pasted"],
        ]);
    });

    test("labels HTML-looking text as text/html", () => {
        expect(handler.getMimeType("<p>hi</p>")).toBe("text/html");
        expect(handler.getMimeType("1 < 2 > 0")).toBe("text/plain");
    });

    test("sends the text as UTF-8 bytes", () => {
        const payload = handler.toSignalPayload({ content: "héllo" }, {});
        expect(decode(payload.content)).toBe("héllo");
        expect(payload.mimeType).toBe("text/plain");
        expect(handler.toSignalPayload({ content: "" }, {})).toBeNull();
    });
});

describe("FileHandler", () => {
    const handler = new FileHandler();

    test("claims offers with a uri-list", () => {
        expect(handler.matchesMimeTypes(["text/uri-list", "text/plain"])).toBe(
            true,
        );
        expect(handler.matchesMimeTypes(["text/plain"])).toBe(false);
    });

    test("captures the copied URIs without the trailing newline", () => {
        const clipboard = fakeClipboard({
            contents: { "text/uri-list": encode("file:///a\nfile:///b\n") },
        });
        expect(capture(handler, clipboard)).toEqual(["file:///a\nfile:///b"]);
    });

    test("ignores an empty uri-list", () => {
        const clipboard = fakeClipboard({
            contents: { "text/uri-list": encode("  \n") },
        });
        expect(capture(handler, clipboard)).toEqual([]);
    });

    test("pastes file URIs as a uri-list on both selections", () => {
        const clipboard = fakeClipboard();
        expect(
            handler.set(clipboard, "# from Files\nfile:///a\nfile:///b"),
        ).toBe(true);
        expect(clipboard.written).toEqual([
            [
                St.ClipboardType.CLIPBOARD,
                "text/uri-list",
                "file:///a\nfile:///b",
            ],
            [St.ClipboardType.PRIMARY, "text/uri-list", "file:///a\nfile:///b"],
        ]);
    });

    test("refuses to paste content without file URIs", () => {
        const clipboard = fakeClipboard();
        expect(handler.set(clipboard, "just text")).toBe(false);
        expect(clipboard.written).toEqual([]);
    });
});

describe("ImageHandler", () => {
    function storeContext() {
        const store = new BinaryDataStore();
        return {
            store,
            capture: {
                storeBinaryData: (marker, data, mimeType) =>
                    store.set(marker, data, mimeType),
            },
            payload: { getBinaryData: (marker) => store.get(marker) },
        };
    }

    test("requests the first supported image type the offer has", () => {
        for (const [types, requested] of [
            [["image/jpeg", "image/png"], "image/png"],
            [["text/plain", "image/webp"], "image/webp"],
        ]) {
            const handler = new ImageHandler();
            expect(handler.matchesMimeTypes(types)).toBe(true);
            const clipboard = fakeClipboard();
            capture(handler, clipboard, storeContext().capture);
            expect(clipboard.requested).toEqual([requested]);
        }
    });

    test("does not claim offers without an image", () => {
        expect(
            new ImageHandler().matchesMimeTypes([
                "text/plain",
                "image/svg+xml",
            ]),
        ).toBe(false);
    });

    test("stores the image and reports a marker that leads back to it", () => {
        const handler = new ImageHandler();
        handler.matchesMimeTypes(["image/png"]);
        const context = storeContext();
        const clipboard = fakeClipboard({
            contents: { "image/png": new Uint8Array([137, 80, 78]) },
        });

        const [marker] = capture(handler, clipboard, context.capture);

        expect(marker).toBe("[BINARY_IMAGE:image/png:3]");
        expect(handler.matchesContent(marker)).toBe(true);
        const payload = handler.toSignalPayload(
            { content: marker },
            context.payload,
        );
        expect(payload.mimeType).toBe("image/png");
        expect(payload.content).toEqual(new Uint8Array([137, 80, 78]));
    });

    test("captures nothing without a store or with an empty image", () => {
        const handler = new ImageHandler();
        handler.matchesMimeTypes(["image/png"]);
        expect(capture(handler, fakeClipboard())).toEqual([]);

        const context = storeContext();
        const clipboard = fakeClipboard({
            contents: { "image/png": new Uint8Array() },
        });
        expect(capture(handler, clipboard, context.capture)).toEqual([]);
        expect(context.store.size).toBe(0);
    });

    test("sends nothing for a marker that is no longer stored", () => {
        const handler = new ImageHandler();
        const { payload } = storeContext();
        expect(
            handler.toSignalPayload(
                { content: "[BINARY_IMAGE:image/png:3]" },
                payload,
            ),
        ).toBeNull();
        expect(
            handler.toSignalPayload({ content: "text" }, payload),
        ).toBeNull();
    });

    test("cannot be pasted back", () => {
        expect(new ImageHandler().set(fakeClipboard(), "x")).toBe(false);
    });

    test("reads the image type from markers and data URLs", () => {
        const handler = new ImageHandler();
        expect(handler.getMimeType("[BINARY_IMAGE:image/gif:9]", "image")).toBe(
            "image/gif",
        );
        expect(handler.getMimeType("data:image/webp;base64,AA")).toBe(
            "image/webp",
        );
        expect(handler.getMimeType("anything")).toBe("image/png");
    });
});

describe("handler priority", () => {
    test("images win over files, and files over text", () => {
        const [image, file, text] = [
            new ImageHandler(),
            new FileHandler(),
            new TextHandler(),
        ];
        expect(image.priority).toBeGreaterThan(file.priority);
        expect(file.priority).toBeGreaterThan(text.priority);
    });
});
