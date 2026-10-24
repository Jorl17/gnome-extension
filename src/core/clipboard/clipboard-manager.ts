import type Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";
import { calculateClipboardMetadata } from "../../utils/clipboard-utils.js";
import { logger } from "../../utils/logger.js";
import { BinaryDataStore } from "./binary-data-store.js";
import { createHandlers } from "./handlers/index.js";
import type { ClipboardContentHandler } from "./handlers/types.js";
import type { BufferLike, ClipboardEvent } from "./types.js";

/** Offered next to the text by KeePassXC and other password managers. */
const PASSWORD_HINT_MIME_TYPE = "x-kde-passwordManagerHint";

export class VicinaeClipboardManager {
    private eventListeners: ((event: ClipboardEvent) => void)[] = [];
    private contentHandlers: ClipboardContentHandler[] = [];
    private binaryStore = new BinaryDataStore();

    private currentContent: string = "";
    private clipboard: St.Clipboard | null = null;
    private selection: Meta.Selection | null = null;
    private settings: Gio.Settings | null = null;
    private isMonitoring = false;
    /** True while content Vicinae asked to conceal is being set; see `concealing()`. */
    private settingConcealed = false;

    constructor() {
        this.contentHandlers = createHandlers();
        this.clipboard = St.Clipboard.get_default();
        this.selection = Shell.Global.get().get_display().get_selection();

        if (!this.selection) {
            logger.error(
                "Failed to get selection instance in clipboard manager",
            );
        }
    }

    enable() {
        if (!this.isMonitoring) {
            this.isMonitoring = true;
            this.setupClipboardMonitoring();
        }
    }

    disable() {
        this.selection?.disconnectObject(this);
        this.isMonitoring = false;
        logger.info("Clipboard monitoring disabled");
    }

    setSettings(settings: Gio.Settings): void {
        this.settings = settings;
        logger.info("Settings set in clipboard manager from external source");

        try {
            const blockedApps = this.settings.get_strv("blocked-applications");
            logger.debug(
                `Current blocked applications: [${blockedApps.join(", ")}]`,
            );
        } catch (err) {
            logger.error(
                "Error reading blocked applications from settings",
                err,
            );
        }
    }

    updateSettings(settings: Gio.Settings): void {
        this.settings = settings;
        logger.info("Settings updated in clipboard manager");

        try {
            const blockedApps = this.settings.get_strv("blocked-applications");
            logger.debug(
                `Updated blocked applications: [${blockedApps.join(", ")}]`,
            );
        } catch (err) {
            logger.error(
                "Error reading updated blocked applications from settings",
                err,
            );
        }
    }

    private isApplicationBlocked(sourceApp: string): boolean {
        if (!this.settings) {
            logger.warn(
                "No settings available in clipboard manager - blocking logic disabled",
            );
            return false; // If no settings, don't block anything
        }

        try {
            const blockedApps = this.settings.get_strv("blocked-applications");
            logger.debug(
                `Checking if ${sourceApp} is blocked. Blocked apps list: [${blockedApps.join(
                    ", ",
                )}]`,
            );

            const source = sourceApp.trim().toLowerCase();
            const isBlocked =
                source !== "" &&
                blockedApps.some((blockedApp: string) => {
                    const blocked = blockedApp.trim().toLowerCase();
                    return (
                        blocked !== "" &&
                        (source.includes(blocked) || blocked.includes(source))
                    );
                });

            if (isBlocked) {
                logger.debug(
                    `Application ${sourceApp} is blocked from clipboard access`,
                );
            } else {
                logger.debug(
                    `Application ${sourceApp} is NOT blocked (not in blocked apps list)`,
                );
            }

            return isBlocked;
        } catch (error) {
            logger.error(
                "Error checking blocked applications in clipboard manager",
                error,
            );
            return false;
        }
    }

    private setupClipboardMonitoring() {
        try {
            if (this.selection) {
                this.selection.connectObject(
                    "owner-changed",
                    (_: unknown, selectionType: Meta.SelectionType) => {
                        this.onSelectionOwnerChanged(_, selectionType);
                    },
                    this,
                );

                this.queryClipboard();

                logger.info(
                    "Clipboard monitoring set up successfully using selection listener",
                );
            }
        } catch (error) {
            logger.error("Error setting up clipboard monitoring", error);
        }
    }

    private onSelectionOwnerChanged(
        _: unknown,
        selectionType: Meta.SelectionType,
    ) {
        if (
            selectionType === Meta.SelectionType.SELECTION_CLIPBOARD &&
            !this.settingConcealed
        ) {
            this.queryClipboard();
        }
    }

    private queryClipboard() {
        if (!this.clipboard) return;

        try {
            const mimeTypes = this.clipboard.get_mimetypes(
                St.ClipboardType.CLIPBOARD,
            );

            // Password managers mark secrets this way; like a blocked app's copy, it is
            // never forwarded, so the secret never reaches the session bus or the history
            if (mimeTypes.includes(PASSWORD_HINT_MIME_TYPE)) {
                logger.debug("Skipping a copy marked as a password");
                return;
            }

            const handler = this.contentHandlers
                .slice()
                .sort((a, b) => b.priority - a.priority)
                .find((h) => h.matchesMimeTypes(mimeTypes));

            if (handler) {
                const context =
                    handler.priority >= 1
                        ? {
                              storeBinaryData: (
                                  marker: string,
                                  data: BufferLike,
                                  mimeType: string,
                              ) => {
                                  this.binaryStore.set(marker, data, mimeType);
                                  logger.debug(`Stored binary data: ${marker}`);
                              },
                          }
                        : undefined;

                handler.capture(
                    this.clipboard,
                    (content) =>
                        this.processClipboardContent(
                            content,
                            "system",
                            handler.contentType,
                        ),
                    context,
                );
            }
        } catch (error) {
            logger.error("Error querying clipboard", error);
        }
    }

    getBinaryData(
        marker: string,
    ): { data: BufferLike; mimeType: string } | null {
        return this.binaryStore.get(marker);
    }

    clearBinaryDataStore(marker?: string): void {
        if (marker) {
            logger.debug(
                `clearBinaryDataStore: clearing marker "${marker}", store size: ${this.binaryStore.size}`,
            );
            this.binaryStore.delete(marker);
        } else {
            logger.debug(
                `clearBinaryDataStore: clearing all ${this.binaryStore.size} entries`,
            );
            this.binaryStore.clear();
        }
    }

    private processClipboardContent(
        text: string,
        source: "user" | "system" | "image",
        contentType: ClipboardEvent["contentType"],
    ) {
        if (!text || text === this.currentContent) {
            if (this.binaryStore.has(text)) {
                this.binaryStore.delete(text);
            }
            return;
        }

        this.currentContent = text;
        this.emitClipboardEvent(text, source, contentType);
    }

    /** `contentType` names the handler that set or captured the content, which reports it. */
    private emitClipboardEvent(
        content: string,
        source: "user" | "system" | "image",
        contentType: ClipboardEvent["contentType"],
    ) {
        const event: ClipboardEvent = {
            type: "clipboard-changed",
            content,
            timestamp: Date.now(),
            source,
            contentType,
        };

        // Get comprehensive metadata using the utility function
        const metadata = calculateClipboardMetadata(event);

        // Blocked apps are kept away from the clipboard history whatever they copy
        const isBlocked = this.isApplicationBlocked(metadata.sourceApp);

        logger.debug("🎯 CLIPBOARD EVENT EMITTED", {
            type: event.type,
            content:
                content.length > 100
                    ? `${content.substring(0, 100)}...`
                    : content,
            contentLength: content.length,
            timestamp: new Date(event.timestamp).toISOString(),
            source: event.source,
            listeners: this.eventListeners.length,
            mimeType: metadata.mimeType,
            contentType: event.contentType,
            sourceApp: metadata.sourceApp,
            isBlocked: isBlocked,
            note: isBlocked
                ? "⚠️ This event will be blocked by clipboard manager"
                : "✅ Event will be processed normally",
        });

        if (isBlocked) {
            logger.debug(
                `🚫 Clipboard access blocked for application: ${metadata.sourceApp} (${event.contentType}) - Event not forwarded to listeners`,
            );
            return;
        }
        this.eventListeners.forEach((listener) => {
            try {
                listener(event);
            } catch (error) {
                logger.error("❌ Error in clipboard event listener", error);
            }
        });
    }

    onClipboardChange(listener: (event: ClipboardEvent) => void): void {
        this.eventListeners.push(listener);
        logger.debug("👂 Clipboard change listener added");
    }

    removeClipboardListener(listener: (event: ClipboardEvent) => void): void {
        const index = this.eventListeners.indexOf(listener);
        if (index > -1) {
            this.eventListeners.splice(index, 1);
            logger.debug("Clipboard change listener removed");
        }
    }

    getCurrentContent(): string {
        return this.currentContent;
    }

    /**
     * St raises owner-changed from inside set_content(), so the selection change caused
     * by `set` is skipped and a concealed copy is never captured or reported.
     */
    private concealing<T>(concealed: boolean, set: () => T): T {
        this.settingConcealed = concealed;
        try {
            return set();
        } finally {
            this.settingConcealed = false;
        }
    }

    setContent(content: string, concealed = false): void {
        const clipboard = this.clipboard;
        if (!clipboard) return;

        try {
            const handler = this.contentHandlers
                .slice()
                .sort((a, b) => b.priority - a.priority)
                .find((h) => h.matchesContent(content));

            if (
                !handler ||
                !this.concealing(concealed, () =>
                    handler.set(clipboard, content),
                )
            )
                return;

            // Other copies are recorded and reported once, when their selection change is
            // captured; a file list is captured as its CRLF uri-list rather than this string
            if (concealed) this.currentContent = content;
        } catch (error) {
            logger.error("Error setting clipboard content", error);
        }
    }

    setContentBinary(
        data: Uint8Array,
        mimeType: string,
        concealed = false,
    ): void {
        const clipboard = this.clipboard;
        if (clipboard) {
            try {
                logger.debug(
                    `Setting binary clipboard content: ${mimeType}, ${data.length} bytes`,
                );

                this.concealing(concealed, () => {
                    clipboard.set_content(
                        St.ClipboardType.CLIPBOARD,
                        mimeType,
                        data,
                    );
                    clipboard.set_content(
                        St.ClipboardType.PRIMARY,
                        mimeType,
                        data,
                    );
                });

                // The selection change reports it, once the owning handler has captured it
                logger.debug(
                    `Binary clipboard content set successfully for ${mimeType}`,
                );
            } catch (error) {
                logger.error("Error setting binary clipboard content", error);
            }
        } else {
            logger.error("Clipboard not available for setContentBinary");
        }
    }

    triggerClipboardChange(
        content: string,
        source: "user" | "system" | "image" = "user",
    ): void {
        this.emitClipboardEvent(content, source, "text");
    }

    destroy(): void {
        this.disable();
        this.eventListeners = [];
        this.currentContent = "";
        logger.debug(
            `destroy: clearing binary store with ${this.binaryStore.size} entries`,
        );
        this.binaryStore.clear();
        this.clipboard = null;
        this.selection = null;
        logger.info("Clipboard manager destroyed");
    }
}
