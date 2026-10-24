# GNOME Shell 51 for the VM suites, run by `VM_TARGET=docker bun test:vm`.
# Package pins follow ddterm/gnome-shell-image (MIT), which maps one Fedora release to one GNOME version.
FROM quay.io/fedora/fedora:45

ARG GNOME_SHELL_VERSION=51.0-1.fc45
ARG MUTTER_VERSION=51.0-1.fc45
ARG GJS_VERSION=1.90.0-1.fc45
ARG BUN_VERSION=1.4.0

RUN printf 'fastestmirror=True\nmax_parallel_downloads=10\n' >>/etc/dnf/dnf.conf && \
    dnf config-manager setopt updates-testing.enabled=false && \
    dnf install -y --nodocs --setopt install_weak_deps=False \
        "gnome-shell-$GNOME_SHELL_VERSION" "mutter-$MUTTER_VERSION" "gjs-$GJS_VERSION" \
        gtk4 dbus-daemon dbus-tools mesa-dri-drivers mesa-libEGL \
        glib2-devel gettext jq zip unzip procps-ng findutils && \
    rpm -q "gnome-shell-$GNOME_SHELL_VERSION" "mutter-$MUTTER_VERSION" "gjs-$GJS_VERSION" && \
    dnf clean all -y

RUN case "$(uname -m)" in aarch64) arch=aarch64 ;; *) arch=x64 ;; esac && \
    curl -fsSLo /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/bun-linux-$arch.zip" && \
    unzip -qj /tmp/bun.zip -d /usr/local/bin && \
    rm /tmp/bun.zip && \
    bun --version

# The latest Vicinae release, so the vicinae suites run instead of being skipped.
# The installer draws its banner with tput; sqlite3 lets suites read Vicinae's clipboard history.
RUN dnf install -y --nodocs --setopt install_weak_deps=False ncurses sqlite && \
    dnf clean all -y && \
    curl -fsSL https://vicinae.com/install | TERM=xterm bash && \
    vicinae version

# vicinae-server links the system's libOpenGL. One RPM from Koji, matched to the installed
# libglvnd and signed with the image's Fedora key, avoids reloading dnf metadata for a single library.
RUN key=$(rpm -q gpg-pubkey --qf '%{VERSION}\n' | head -1 | tail -c 9) && \
    set -- $(rpm -q --qf '%{VERSION} %{RELEASE} %{ARCH}' libglvnd) && \
    rpm -i "https://kojipkgs.fedoraproject.org/packages/libglvnd/$1/$2/data/signed/$key/$3/libglvnd-opengl-$1-$2.$3.rpm" && \
    ldd /usr/local/lib/vicinae/usr/libexec/vicinae/vicinae-server | grep -c libOpenGL

RUN useradd -m tester && \
    install -d -o tester -g tester /home/tester/repo /home/tester/.bun/install/cache

COPY entrypoint.sh /usr/local/bin/vm-test-entrypoint
ENTRYPOINT ["/usr/local/bin/vm-test-entrypoint"]
