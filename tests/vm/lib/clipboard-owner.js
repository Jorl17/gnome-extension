import Gdk from "gi://Gdk?version=4.0";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

// Copies `text` on any key press, offered under exactly the given MIME types.
// A type written as "type|value" is offered with that value instead, as password
// managers do with x-kde-passwordManagerHint|secret ("=" appears in MIME parameters).
const [appId, text, ...types] = ARGV;

const bytes = (value) => new GLib.Bytes(new TextEncoder().encode(value));
const provider = Gdk.ContentProvider.new_union(
    types.map((type) => {
        const [mimeType, value] = type.split("|");
        return Gdk.ContentProvider.new_for_bytes(
            mimeType,
            bytes(value ?? text),
        );
    }),
);

const app = new Gtk.Application({ application_id: appId });
app.connect("activate", () => {
    const win = new Gtk.ApplicationWindow({
        application: app,
        title: "Clipboard owner",
        default_width: 400,
        default_height: 300,
    });
    const keys = new Gtk.EventControllerKey();
    keys.connect("key-pressed", () => {
        win.get_clipboard().set_content(provider);
        return true;
    });
    win.add_controller(keys);
    win.present();
});
app.run([]);
