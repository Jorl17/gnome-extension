import GdkPixbuf from "gi://GdkPixbuf";
import GLib from "gi://GLib";
import {
    assert,
    notYet,
    skip,
    sleep,
    test,
    todo,
    waitFor,
} from "../lib/harness.js";
import { pressKeys } from "../lib/pointer.js";
import {
    Clipboard,
    openClipboardOwner,
    openWindow,
    Windows,
} from "../lib/shell.js";
import {
    clipboardHistory,
    OfferKind,
    openDmenu,
    startVicinae,
    VICINAE,
} from "../lib/vicinae.js";

if (!VICINAE) skip("vicinae is not installed in the VM");

const encode = (text) => new TextEncoder().encode(text);
const md5 = (bytes) =>
    GLib.compute_checksum_for_data(GLib.ChecksumType.MD5, bytes);
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** A small picture in a random colour, so every run copies different bytes. */
function picture(format) {
    const pixbuf = GdkPixbuf.Pixbuf.new(
        GdkPixbuf.Colorspace.RGB,
        false,
        8,
        4,
        4,
    );
    pixbuf.fill(Math.floor(Math.random() * 0xffffff) * 0x100 + 0xff);
    const [, bytes] = pixbuf.save_to_bufferv(format, [], []);
    return bytes;
}

const GIF_1X1 = GLib.base64_decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
);

/** Waits until Vicinae stored `bytes` and checks how it filed them. */
function expectStored(bytes, mimeType, kind) {
    const hash = md5(bytes);
    const entry = waitFor(
        `${mimeType} copy in Vicinae's history`,
        () =>
            clipboardHistory().find((offer) => offer.md5 === hash) ??
            notYet(JSON.stringify(clipboardHistory().map((o) => o.mime_type))),
        10000,
    );
    assert.equal(entry.mime_type, mimeType, "stored MIME type");
    assert.equal(entry.kind, kind, "stored kind");
    assert.equal(entry.size, bytes.length, "stored size");
}

const copyText = (text) => Clipboard.call("SetContent", "(s)", [text]);
const copyAs = (bytes, mimeType) =>
    Clipboard.call("SetContentBinary", "(ays)", [bytes, mimeType]);

test("vicinae listens to the extension's clipboard", () => {
    startVicinae({ close_on_focus_loss: false });
    const win = openWindow("org.example.CopySource", "Copy source");
    Windows.call("Activate", "(u)", [win.id]);
    const text = `first copy ${unique()}`;
    copyText(text);
    expectStored(encode(text), "text/plain", OfferKind.Text);
});

test("plain text is stored as text", () => {
    const text = `plain text ${unique()}`;
    copyText(text);
    expectStored(encode(text), "text/plain", OfferKind.Text);
});

test("HTML is stored as text/html", () => {
    const html = `<p>paragraph ${unique()}</p>`;
    copyText(html);
    expectStored(encode(html), "text/html", OfferKind.Text);
});

test("a URL is stored as a link", () => {
    const url = `https://example.com/${unique()}`;
    copyText(url);
    expectStored(encode(url), "text/plain", OfferKind.Link);
});

for (const target of ["text/plain;charset=utf-8", "UTF8_STRING"]) {
    test(`text offered only as ${target} is stored as text`, () => {
        const text = `${target} copy ${unique()}`;
        copyAs(encode(text), target);
        expectStored(encode(text), "text/plain", OfferKind.Text);
    });
}

for (const [mimeType, bytes] of [
    ["image/png", () => picture("png")],
    ["image/jpeg", () => picture("jpeg")],
    ["image/gif", () => GIF_1X1],
]) {
    test(`a ${mimeType} image is stored as an image`, () => {
        const image = bytes();
        copyAs(image, mimeType);
        expectStored(image, mimeType, OfferKind.Image);
    });
}

/** Real files, offered the way file managers do: CRLF-separated URIs. */
function copyFiles(count) {
    const uris = [];
    for (let i = 0; i < count; i++) {
        const path = `${GLib.get_tmp_dir()}/copied-${unique()}.txt`;
        GLib.file_set_contents(path, "copied file");
        uris.push(GLib.filename_to_uri(path, null));
    }
    copyAs(encode(`${uris.join("\r\n")}\r\n`), "text/uri-list");
    return encode(uris.join("\r\n"));
}

for (const count of [1, 3]) {
    test(`${count} copied file${count > 1 ? "s are" : " is"} stored as files`, () => {
        expectStored(copyFiles(count), "text/uri-list", OfferKind.File);
    });
}

const XK_C = 0x63;
const TEXT_TARGETS = ["text/plain;charset=utf-8", "UTF8_STRING", "text/plain"];

/** Copies from a real client, which takes the clipboard on a key press like Ctrl+C. */
function copyFromApp(appId, text, types) {
    const win = openClipboardOwner(appId, text, types);
    Windows.call("Activate", "(u)", [win.id]);
    waitFor(
        `focus on ${appId}`,
        () => Windows.json("Details", "(u)", [win.id]).has_focus,
    );
    pressKeys(XK_C);
}

test("an app's copy under several text targets reaches Vicinae", () => {
    const text = `app copy ${unique()}`;
    copyFromApp("org.example.TextApp", text, TEXT_TARGETS);
    expectStored(encode(text), "text/plain", OfferKind.Text);
});

test("a password manager's copy is kept out of Vicinae's history", () => {
    const secret = `hunter2-${unique()}`;
    copyFromApp("org.keepassxc.KeePassXC", secret, [
        ...TEXT_TARGETS,
        "x-kde-passwordManagerHint|secret",
    ]);
    sleep(1500);
    // A later copy landing shows the history caught up, so the password had its chance
    const later = `after the password ${unique()}`;
    copyText(later);
    expectStored(encode(later), "text/plain", OfferKind.Text);
    assert.ok(
        !clipboardHistory().some((offer) => offer.md5 === md5(encode(secret))),
        "the password was stored in Vicinae's history",
    );
});

const XK_CONTROL_L = 0xffe3;
const XK_SHIFT_L = 0xffe1;

todo(
    "vicinae's own concealed copies stay out of its history",
    "needs a Vicinae release whose GNOME backend calls SetConcealedContent",
    () => {
        const entry = `dmenu entry ${unique()}`;
        openDmenu([entry]);
        sleep(500);
        // "Select and copy entry" copies through copyText(), which conceals by default
        pressKeys(XK_CONTROL_L, XK_SHIFT_L, XK_C);
        waitFor(
            "vicinae to copy the entry through the extension",
            () => Clipboard.call("GetCurrentContent") === entry,
        );
        sleep(1500);
        const later = `after the concealed copy ${unique()}`;
        copyText(later);
        expectStored(encode(later), "text/plain", OfferKind.Text);
        assert.ok(
            !clipboardHistory().some(
                (offer) => offer.md5 === md5(encode(entry)),
            ),
            "vicinae's concealed copy was stored in its history",
        );
    },
);

todo(
    "with Ignore Passwords off, a password manager's copy is kept",
    "the extension drops these copies; Vicinae would need the password hint over D-Bus to decide",
    () => {
        startVicinae({
            close_on_focus_loss: false,
            providers: {
                clipboard: { preferences: { ignorePasswords: false } },
            },
        });
        const secret = `kept-on-purpose-${unique()}`;
        copyFromApp("org.keepassxc.KeePassXC", secret, [
            ...TEXT_TARGETS,
            "x-kde-passwordManagerHint|secret",
        ]);
        expectStored(encode(secret), "text/plain", OfferKind.Text);
    },
);
