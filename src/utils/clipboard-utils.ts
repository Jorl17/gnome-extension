import type { ClipboardOffer } from "../core/clipboard/selection-source.js";
import type { BufferLike } from "../core/clipboard/types.js";
import { getFocusedWindowApp } from "./window-utils.js";

/**
 * Configuration constants for performance optimization
 */
export const CLIPBOARD_CONFIG = {
    MAX_CLIPBOARD_SIZE: 10 * 1024 * 1024, // 10MB - reasonable clipboard limit
    FILE_URI_PREFIX: "file://",
} as const;

/**
 * Converts BufferLike to Uint8Array for D-Bus signal emission.
 */
export function bufferLikeToUint8Array(buffer: BufferLike): Uint8Array {
    if (buffer instanceof Uint8Array) {
        return buffer;
    }

    if (buffer instanceof ArrayBuffer) {
        return new Uint8Array(buffer);
    }

    if (buffer && typeof buffer === "object" && "length" in buffer) {
        const uint8Array = new Uint8Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            uint8Array[i] = buffer[i];
        }
        return uint8Array;
    }

    throw new Error(`Unsupported buffer type: ${typeof buffer}`);
}

/**
 * Decodes clipboard content (GLib.Bytes or raw array) to Uint8Array.
 */
export function decodeClipboardBytes(content: unknown): Uint8Array | null {
    if (!content || typeof content !== "object") return null;

    const obj = content as Record<string, unknown>;
    const ctor = obj.constructor as { name?: string } | undefined;
    const isBytes =
        ctor?.name === "GLib.Bytes" ||
        (ctor?.name && String(ctor.name).includes("Bytes"));

    if (isBytes) {
        const bytes = content as {
            get_data?: () => Uint8Array | number[];
            toArray?: () => Uint8Array | number[];
        };
        const data =
            typeof bytes.get_data === "function"
                ? bytes.get_data()
                : typeof bytes.toArray === "function"
                  ? bytes.toArray()
                  : null;
        if (data)
            return data instanceof Uint8Array ? data : new Uint8Array(data);
    }

    if ("data" in obj && obj.data) {
        const arr = obj.data as Uint8Array | number[];
        return arr instanceof Uint8Array ? arr : new Uint8Array(arr);
    }
    return null;
}

/**
 * Checks if content is a file URI or newline-separated list of file URIs
 */
export function isFileUri(content: string): boolean {
    if (!content || typeof content !== "string") return false;
    const trimmed = content.trim();
    if (!trimmed) return false;
    return trimmed
        .split(/\r?\n/)
        .every((line) =>
            line.trim().startsWith(CLIPBOARD_CONFIG.FILE_URI_PREFIX),
        );
}

/**
 * Extracts file URIs from content (handles newline-separated lists, filters comments)
 */
export function parseFileUris(content: string): string[] {
    if (!content || typeof content !== "string") return [];
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
            (line) =>
                line &&
                !line.startsWith("#") &&
                line.startsWith(CLIPBOARD_CONFIG.FILE_URI_PREFIX),
        );
}

/** Text targets St.Clipboard.get_text() and text fields ask for. */
const TEXT_TARGETS = ["text/plain;charset=utf-8", "text/plain", "UTF8_STRING"];

/**
 * What a file manager offers for copied files, so file managers and Electron apps
 * paste files, plus the original text so text fields can still paste the string.
 */
export function fileListOffers(text: string): ClipboardOffer[] {
    const uris = parseFileUris(text);
    if (uris.length === 0) return [];
    const encode = (value: string) => new TextEncoder().encode(value);
    return [
        // RFC 2483 ends every line of a uri-list with CRLF
        ["text/uri-list", encode(uris.map((uri) => `${uri}\r\n`).join(""))],
        ["x-special/gnome-copied-files", encode(["copy", ...uris].join("\n"))],
        ...TEXT_TARGETS.map((type): ClipboardOffer => [type, encode(text)]),
    ];
}

/**
 * Calculates simplified clipboard metadata for an event
 * Removed unused fields (timestamp, contentType, contentHash, size)
 */
export function calculateClipboardMetadata(event: {
    content: string;
    source: string;
}) {
    const content = event.content;
    let mimeType = "text/plain";
    const sourceApp = getFocusedWindowApp();

    // Determine MIME type based on content
    if (event.source === "image") {
        if (content.startsWith("data:image/")) {
            const match = content.match(/^data:(image\/[^;]+);/);
            mimeType = match ? match[1] : "image/png";
        }
    } else if (content.startsWith("data:")) {
        // Handle other data URLs
        const match = content.match(/^data:([^;]+);/);
        mimeType = match ? match[1] : "application/octet-stream";
    } else if (isFileUri(content)) {
        mimeType = "text/uri-list";
    } else {
        // Text content
        mimeType = "text/plain";

        // Check if it looks like HTML
        if (
            content.includes("<") &&
            content.includes(">") &&
            (content.includes("<html") ||
                content.includes("<div") ||
                content.includes("<p"))
        ) {
            mimeType = "text/html";
        }
    }

    return {
        mimeType,
        sourceApp,
    };
}
