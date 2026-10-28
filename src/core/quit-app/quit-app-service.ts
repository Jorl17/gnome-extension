// Quit the focused app with all its windows, like Cmd+Q on a Mac.
//
// This code is not part of Vicinae. We keep it in this extension so that we
// need only one extension of our own. It has its own D-Bus object and
// interface, so it stays separate from the Vicinae services.
//
// We call GNOME's own quit, the one behind "Quit" in the app menu of the top
// bar. GNOME first activates the app's "quit" action when the app has one,
// and otherwise asks every window of the app to close.
//
//   gdbus call --session --dest org.gnome.Shell \
//     --object-path /org/gnome/Shell/Extensions/QuitApp \
//     --method org.gnome.Shell.Extensions.QuitApp.QuitFocusedApp
//
// The reply contains the id of the app we asked to quit, or an empty string
// when no app has the focus, for example when the desktop has the focus.

import Gio from "gi://Gio";
import Shell from "gi://Shell";
import { logger } from "../../utils/logger.js";

const OBJECT_PATH = "/org/gnome/Shell/Extensions/QuitApp";

const QUIT_APP_DBUS_IFACE = `
<node>
   <interface name="org.gnome.Shell.Extensions.QuitApp">
      <method name="QuitFocusedApp">
         <arg type="s" direction="out" name="appId" />
      </method>
   </interface>
</node>`;

export class QuitAppService {
    private dbusObject: Gio.DBusExportedObject;

    constructor() {
        this.dbusObject = Gio.DBusExportedObject.wrapJSObject(
            QUIT_APP_DBUS_IFACE,
            this,
        );
    }

    export(): void {
        this.dbusObject.export(Gio.DBus.session, OBJECT_PATH);
    }

    unexport(): void {
        this.dbusObject.unexport();
    }

    QuitFocusedApp(): string {
        const app = Shell.WindowTracker.get_default().focus_app;
        if (!app) return "";

        const appId = app.get_id();
        logger.info(`QuitApp: quitting ${appId}`);
        app.request_quit();
        return appId;
    }
}
