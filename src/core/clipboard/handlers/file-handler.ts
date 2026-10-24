import St from "gi://St";
import {
    decodeClipboardBytes,
    fileListOffers,
    isFileUri,
    parseFileUris,
} from "../../../utils/clipboard-utils.js";
import { setClipboardOffers } from "../selection-source.js";
import type {
    ClipboardContentHandler,
    ClipboardHandlerContext,
    SignalPayload,
    SignalPayloadContext,
} from "./types.js";

const MIME_TYPE = "text/uri-list";

export class FileHandler implements ClipboardContentHandler {
    readonly mimeTypes = [MIME_TYPE] as const;
    readonly priority = 1;
    readonly contentType = "files";

    matchesMimeTypes(types: string[]): boolean {
        return types.includes(MIME_TYPE);
    }

    matchesContent(content: string): boolean {
        return isFileUri(content);
    }

    capture(
        clipboard: St.Clipboard,
        onResult: (content: string) => void,
        _context?: ClipboardHandlerContext,
    ): void {
        clipboard.get_content(
            St.ClipboardType.CLIPBOARD,
            MIME_TYPE,
            (_: unknown, content: unknown) => {
                if (!content) return;
                const data = decodeClipboardBytes(content);
                if (!data || data.length === 0) return;
                const uris = parseFileUris(new TextDecoder().decode(data));
                // Vicinae splits uri-lists on CRLF, the RFC 2483 line ending
                if (uris.length > 0) onResult(uris.join("\r\n"));
            },
        );
    }

    /** Offers the files the way file managers do, and the string itself for text fields. */
    set(_clipboard: St.Clipboard, content: string): boolean {
        const offers = fileListOffers(content);
        if (offers.length === 0) return false;
        setClipboardOffers(offers);
        return true;
    }

    getMimeType(): string {
        return MIME_TYPE;
    }

    toSignalPayload(
        event: { content: string },
        _context: SignalPayloadContext,
    ): SignalPayload | null {
        if (!event.content) return null;
        return {
            content: new TextEncoder().encode(event.content),
            mimeType: MIME_TYPE,
        };
    }
}
