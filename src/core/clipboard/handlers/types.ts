import type St from "gi://St";
import type { BufferLike, ClipboardEvent } from "../types.js";

/**
 * Context passed to handlers that need access to manager internals
 */
export interface ClipboardHandlerContext {
    storeBinaryData(marker: string, data: BufferLike, mimeType: string): void;
}

export interface SignalPayloadContext {
    getBinaryData(
        marker: string,
    ): { data: BufferLike; mimeType: string } | null;
}

export interface SignalPayload {
    content: Uint8Array;
    mimeType: string;
}

/**
 * Handler for a clipboard content type (text, file, image).
 * Encapsulates identification, capture from St.Clipboard, and MIME metadata.
 */
export interface ClipboardContentHandler {
    readonly mimeTypes: readonly string[];
    readonly priority: number;
    /** How clipboard events captured by this handler are tagged. */
    readonly contentType: ClipboardEvent["contentType"];
    matchesMimeTypes(types: string[]): boolean;
    matchesContent(content: string): boolean;
    capture(
        clipboard: St.Clipboard,
        onResult: (content: string) => void,
        context?: ClipboardHandlerContext,
    ): void;
    set(clipboard: St.Clipboard, content: string): boolean;
    getMimeType(content: string, source?: string): string;
    toSignalPayload(
        event: { content: string; source: string },
        context: SignalPayloadContext,
    ): SignalPayload | null;
}
