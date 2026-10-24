import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";

// On a key press, writes what the clipboard offers and the text a text field would
// paste to `outPath`, as {"types": [...], "text": "..."}
const [appId, outPath] = ARGV;

const app = new Gtk.Application({ application_id: appId });
app.connect("activate", () => {
    const win = new Gtk.ApplicationWindow({
        application: app,
        title: "Clipboard reader",
        default_width: 400,
        default_height: 300,
    });
    const keys = new Gtk.EventControllerKey();
    keys.connect("key-pressed", () => {
        const clipboard = win.get_clipboard();
        const types = clipboard.get_formats().get_mime_types() ?? [];
        clipboard.read_text_async(null, (_clipboard, result) => {
            let text = null;
            try {
                text = clipboard.read_text_finish(result);
            } catch {}
            GLib.file_set_contents(outPath, JSON.stringify({ types, text }));
        });
        return true;
    });
    win.add_controller(keys);
    win.present();
});
app.run([]);
