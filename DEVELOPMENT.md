## Development

### Overview

This extension uses a modern TypeScript-based development workflow with Bun and automated build scripts. The recommended setup involves:

- **Host machine**: Edit code, run linting/formatting, and manage versions
- **VM environment**: Test the extension in a controlled GNOME session
- **Automated scripts**: Handle building, installation, VM setup, and development workflow

### Prerequisites

- **Host**: Bun, OpenSSH client
- **VM**: Linux distribution with GNOME and Wayland (I use Fedora)

### Development Scripts

The project includes several automation scripts in the `scripts/` directory:

**Fun fact:** the build uses [`esbuild-preserve-whitespace`](https://github.com/dagimg-dot/esbuild-preserve-whitespace), a plugin I made because I couldn't find an existing solution that keeps whitespace intact when transpiling GNOME Shell extensions. It's on npm if you need it! ☝️🤓

#### `scripts/build.sh` - Build and Package
Handles the complete build process:
- Compiles TypeScript files using esbuild
- Compiles GResource files and translations
- Creates the `.shell-extension.zip` package
- Supports installation, GDM restart, and unsafe reload (legacy)

#### `scripts/log.sh` - Log Monitoring
Monitors GNOME Shell logs for debugging:
- Captures logs from both `gnome-shell` and `gjs` processes
- Supports filtered output showing only extension-related logs
- Automatically extracts extension name from `metadata.json`

#### `scripts/setup.sh` - VM Bootstrap
Automates VM setup for development:
- Generates `dev-{project}.sh` script for SSHFS mounting and VM access
- Copies development script to VM
- Installs `sshfs` and creates mount points
- Sets up proper permissions and SSHFS mounting

#### `scripts/run-dev-session.sh` - Nested Dev Session
Launches a development GNOME Shell session using `dbus-run-session`:
- Uses `--devkit --wayland` on GNOME 49+
- Falls back to `--nested --wayland` on older versions

#### `scripts/update-contrib.sh` - Contributor Management
Automatically updates contributors in the About page:
- Fetches contributors from git history
- Updates the credits section with GitHub links
- Maintains contributor information dynamically

#### `scripts/bump-version.js` - Version Management
Handles version bumping and releases:
- Updates `package.json` and `metadata.json` versions
- Creates git commits and tags
- Supports semantic versioning

### Development Workflow

#### 1. Host Machine Setup

**Install Dependencies:**
```bash
bun install  # Install all dependencies
```

**Code Quality Tools:**
```bash
bun format         # Format code with Biome
bun lint          # Lint with safe fixes
bun lint:fix      # Lint with unsafe fixes
bun check         # Combined lint + format check
bun check:types   # TypeScript type checking only
```

**Version Management:**
```bash
bun bump 1.5.0    # Bump version to 1.5.0
bun release 1.5.0 # Bump version, commit, and create git tag
```

**Update Contributors:**
```bash
bun update-credits  # Update contributor list from git history
```

#### 2. VM Environment Setup

**Initial VM Configuration:**
1. Install Fedora 41+ and log in
2. Enable **auto-login** so the session restarts automatically after GDM reloads:

   **GUI method**: Settings → Users → Automatic Login (ON)

   **Manual method**: edit `/etc/gdm/custom.conf` and add to the `[daemon]` section:
   ```ini
   [daemon]
   AutomaticLoginEnable=True
   AutomaticLogin=your-username
   ```
3. Install required tools:
   ```bash
   sudo dnf install -y fuse-sshfs gnome-extensions-app jq
   ```
4. Install Bun:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
5. Set up autostart for convenient development:
   - Add **GNOME Extensions** (`org.gnome.Extensions.desktop`) to autostart
   - Add a **Terminal** to autostart

**Bootstrap VM environment from Host:**
```bash
bun setup -- user@vm-ip  # Generate dev script, copy to VM, install sshfs
```

**Run generated script in VM:**
```bash
~/dev-vicinae-gnome-extension.sh  # Mount host directory via SSHFS and start shell
```

Once mounted, you are in the project directory at `/mnt/host/vicinae-gnome-extension` with an interactive shell.

#### 3. Development Commands

**Build and Install (GNOME 49+ Wayland):**
```bash
bun build              # Build extension package only
bun build:install      # Build and install extension
bun build:install:gdm  # Build, install, then restart GDM to reload (auto-login required)
```

**Build and Install (Xorg / old workflow):**
```bash
bun dev            # Build, install, and unsafe-reload (Xorg only, legacy)
bun dev:nested     # Build, install, and start nested Wayland session
```

**Debugging:**
```bash
bun log            # Monitor extension logs (filtered)
bun log:all        # Monitor all GNOME Shell logs
```

#### Typical Dev Loop (GNOME 49+ on Wayland)

1. Edit code on the **host**
2. On the **VM**, ensure the SSHFS mount is active (`~/dev-vicinae-gnome-extension.sh`)
3. In the mounted directory on the VM:
   ```bash
   bun build:install:gdm
   ```
4. GDM restarts → VM auto-logs back in → extension is installed and active
5. Check logs:
   ```bash
   bun log
   ```

### End-to-End Tests in the VM

`bun test:vm` runs a smoke suite against a real GNOME Shell inside the VM, driven entirely from the host over SSH:

1. Syncs the current checkout to `~/.cache/vicinae-vm-test/<checkout>/` on the VM (rsync, no SSHFS needed)
2. Builds the extension there and installs it into throwaway XDG directories
3. Starts an isolated **headless** GNOME Shell (`--headless --virtual-monitor`) on a private session bus, so your real session, extensions and settings are untouched and no GDM restart is needed
4. Opens GTK test windows and exercises the `Windows` and `Clipboard` D-Bus APIs the way Vicinae does, plus disable/enable cycles, then fails on any extension error in the shell log

**One-time setup:**
```bash
# In the VM
sudo systemctl enable --now sshd

# On the host
ssh-copy-id -i ~/.ssh/your_key.pub user@vm-ip
```

Then add to `.env` (gitignored):
```ini
VM_TARGET=user@vm-ip
VM_SSH_KEY=~/.ssh/your_key
```

**Usage:**
```bash
bun test:vm                  # Run every suite
bun test:vm windows          # Only the windows suite
bun test:vm maximize         # Tests whose name contains "maximize", plus the earlier tests of their suite
VM_TEST_KEEP=1 bun test:vm   # Keep the logs on the VM even when everything passes
VM_TEST_DEBUG=1 bun test:vm  # Run the extension with debug logging
```

To test a PR, check it out in a git worktree and run `scripts/vm-test.sh` from there; each checkout gets its own copy on the VM.

**Layout:**

- `tests/vm/suites/*.js` — one file per area (`windows`, `clipboard`, `lifecycle`, `launcher`, `vicinae`, `prefs`); every file here is picked up automatically
- `tests/vm/lib/harness.js` — `test`, `todo` (known gaps that don't fail the run), `skip`, `afterAll`, `allowLogged` (expected extension errors), `assert`, `waitFor`
- `tests/vm/lib/shell.js` — D-Bus clients (`Windows`, `Clipboard`) with `watch()` for signals, extension state and settings helpers, `openWindow()`, `openLauncher()`
- `tests/vm/lib/pointer.js` — `clickAt(x, y)` through Mutter's RemoteDesktop API
- `tests/vm/lib/vicinae.js` — runs the real Vicinae inside the headless session; the `vicinae` suite is skipped when it isn't installed in the VM
- `tests/vm/runner.js` — waits for the extension, runs the suites, and fails a suite if the extension logs errors while it runs
- `tests/vm/run.sh`, `tests/vm/session.sh` — build, isolate and start the headless shell (VM side)

**Adding a test** — create `tests/vm/suites/<area>.js`, or add to an existing one:

```js
import { test, waitFor } from "../lib/harness.js";
import { openWindow, Windows } from "../lib/shell.js";

test("Fullscreen toggles the window", () => {
    const win = openWindow("org.example.Fullscreen", "Fullscreen");
    Windows.call("ToggleFullscreen", "(u)", [win.id]);
    waitFor("fullscreen", () => Windows.json("Details", "(u)", [win.id]).fullscreen);
});
```

Tests run in order within a file, so later tests can reuse windows opened by earlier ones. Windows from `openWindow()` are closed when the suite ends. Avoid app IDs containing `vicinae`, because the extension treats those windows as the launcher and hides them from `List`.

**Unit tests vs VM tests:** `bun test` runs the fast host-side unit tests (`tests/*.test.js`, mocked Mutter objects, useful for code paths of GNOME versions the VM doesn't run). `bun test:vm` runs the suites against a real shell. Never name a VM suite `*.test.js`: `bun test` would pick it up and fail on its GNOME-only imports.

### Project Structure

- **`src/`**: TypeScript source files
- **`dist/`**: Compiled JavaScript (auto-generated)
- **`build/`**: Build artifacts and packages (gitignored)
- **`scripts/`**: Development automation scripts
- **`data/`**: Static resources (icons, UI files)

### Notes

- Build artifacts are automatically placed in `build/` directory
- The `dist/` directory contains compiled JavaScript when using TypeScript
- Biome handles all linting and formatting; `dist/` is gitignored
- Generated `scripts/dev-*.sh` files are gitignored — each developer/environment generates their own via `bun setup`
- GDM restart (`systemctl restart gdm`) logs out the session — ensure **auto-login** is enabled in the VM so the session comes back without manual login
