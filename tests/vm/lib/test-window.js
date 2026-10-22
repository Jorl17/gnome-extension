import Gtk from "gi://Gtk?version=4.0";

const [appId, title, size] = ARGV;

const app = new Gtk.Application({ application_id: appId });
app.connect("activate", () => {
    new Gtk.ApplicationWindow({
        application: app,
        title,
        default_width: 400,
        default_height: 300,
        resizable: size !== "fixed",
    }).present();
});
app.run([]);
