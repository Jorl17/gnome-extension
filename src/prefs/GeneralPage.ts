import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import type Gtk from "gi://Gtk";
import { getTemplate } from "../utils/getTemplate.js";
import { getVerbosity, LOGGING_LEVELS, logger } from "../utils/logger.js";

const LOGS_COMMAND = 'journalctl --user -n 50 -g "Vicinae"';

export const GeneralPage = GObject.registerClass(
    {
        GTypeName: "VicinaeGeneralPage",
        Template: getTemplate("GeneralPage"),
        InternalChildren: [
            "showStatusIndicator",
            "loggingLevel",
            "launcherAppClass",
            "journalctlRow",
            "copyLogsCommandButton",
        ],
    },
    class GeneralPage extends Adw.PreferencesPage {
        private settings!: Gio.Settings;

        declare _showStatusIndicator: Adw.SwitchRow;
        declare _loggingLevel: Adw.ComboRow;
        declare _launcherAppClass: Adw.EntryRow;
        declare _journalctlRow: Adw.ActionRow;
        declare _copyLogsCommandButton: Gtk.Button;

        bindSettings(settings: Gio.Settings) {
            this.settings = settings;
            logger.debug("Settings bound to GeneralPage");

            this.bindShowStatusIndicator(settings);
            this.bindLoggingLevel(settings);
            this.bindLauncherAppClass(settings);
            this.bindCopyLogsCommand();
        }

        private bindCopyLogsCommand() {
            const button = this._copyLogsCommandButton;
            let resetIconId = 0;
            const cancelReset = () => {
                if (resetIconId) GLib.source_remove(resetIconId);
                resetIconId = 0;
            };

            button.connect("clicked", () => {
                Gdk.Display.get_default()?.get_clipboard()?.set(LOGS_COMMAND);
                button.set_icon_name("object-select-symbolic");

                cancelReset();
                resetIconId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    1500,
                    () => {
                        resetIconId = 0;
                        button.set_icon_name("edit-copy-symbolic");
                        return GLib.SOURCE_REMOVE;
                    },
                );
            });
            this.connect("destroy", cancelReset);
        }

        /** `show-status-indicator` ↔ status indicator switch. */
        private bindShowStatusIndicator(settings: Gio.Settings) {
            settings.bind(
                "show-status-indicator",
                this._showStatusIndicator,
                "active",
                Gio.SettingsBindFlags.DEFAULT,
            );
        }

        /** `logging-level` ↔ logging ComboRow (not a direct GSettings bind). */
        private bindLoggingLevel(settings: Gio.Settings) {
            const row = this._loggingLevel;
            row.set_selected(
                getVerbosity(settings.get_string("logging-level")),
            );

            row.connect("notify::selected", () => {
                const selectedIndex = row.get_selected();
                if (
                    selectedIndex >= 0 &&
                    selectedIndex < LOGGING_LEVELS.length
                ) {
                    settings.set_string(
                        "logging-level",
                        LOGGING_LEVELS[selectedIndex],
                    );
                }
            });
        }

        /** `launcher-app-class` ↔ launcher WM class entry. */
        private bindLauncherAppClass(settings: Gio.Settings) {
            settings.bind(
                "launcher-app-class",
                this._launcherAppClass,
                "text",
                Gio.SettingsBindFlags.DEFAULT,
            );
        }
    },
);
