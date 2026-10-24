import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Meta from "gi://Meta";

/** A MIME type offered on the clipboard, with the bytes it reads as. */
export type ClipboardOffer = [mimeType: string, data: Uint8Array];

/**
 * Offers several MIME types at once, which St.Clipboard cannot do. Each read is
 * served by a Meta.SelectionSourceMemory holding that type's bytes.
 */
const MultiTypeSource = GObject.registerClass(
    class MultiTypeSource extends Meta.SelectionSource {
        private declare sources: Map<string, Meta.SelectionSourceMemory>;

        setOffers(offers: ClipboardOffer[]) {
            this.sources = new Map(
                offers.map(([mimeType, data]) => [
                    mimeType,
                    Meta.SelectionSourceMemory.new(
                        mimeType,
                        new GLib.Bytes(data),
                    ),
                ]),
            );
        }

        override vfunc_get_mimetypes(): string[] {
            return [...this.sources.keys()];
        }

        override vfunc_read_async(
            mimetype: string,
            cancellable: Gio.Cancellable | null,
            callback: Gio.AsyncReadyCallback<this> | null,
        ): void {
            // Mutter only asks for offered types, so the source always exists
            this.sources
                .get(mimetype)
                ?.read_async(mimetype, cancellable, (_source, result) =>
                    callback?.(this, result, null),
                );
        }

        override vfunc_read_finish(result: Gio.AsyncResult): Gio.InputStream {
            const source = result.get_source_object();
            if (!(source instanceof Meta.SelectionSourceMemory))
                throw new Error("Clipboard read did not come from an offer");
            return source.read_finish(result);
        }
    },
);

/** Takes the clipboard and primary selection with `offers`. */
export function setClipboardOffers(offers: ClipboardOffer[]) {
    const selection = global.display.get_selection();
    for (const type of [
        Meta.SelectionType.SELECTION_CLIPBOARD,
        Meta.SelectionType.SELECTION_PRIMARY,
    ]) {
        const source = new MultiTypeSource();
        source.setOffers(offers);
        selection.set_owner(type, source);
    }
}
