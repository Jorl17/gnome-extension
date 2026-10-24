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
    },
});
