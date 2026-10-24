import { plugin } from "bun";

// Unit tests run under Bun, where gi:// modules do not exist. Modules that import them
// for constants get these stand-ins; anything needing real GNOME belongs in tests/vm.
plugin({
    name: "gi-stubs",
    setup(build) {
        build.module("gi://St", () => ({
            exports: {
                default: { ClipboardType: { PRIMARY: 0, CLIPBOARD: 1 } },
            },
            loader: "object",
        }));
        build.module("gi://GLib", () => ({
            exports: {
                default: {
                    Bytes: class {
                        constructor(data) {
                            this.data = data;
                        }
                    },
                },
            },
            loader: "object",
        }));
        build.module("gi://GObject", () => ({
            exports: { default: { registerClass: (klass) => klass } },
            loader: "object",
        }));
        build.module("gi://Meta", () => ({
            exports: {
                default: {
                    SelectionSource: class {},
                    SelectionSourceMemory: {
                        new: (mimeType, bytes) => ({ mimeType, bytes }),
                    },
                    SelectionType: {
                        SELECTION_PRIMARY: 0,
                        SELECTION_CLIPBOARD: 1,
                    },
                },
            },
            loader: "object",
        }));
    },
});
