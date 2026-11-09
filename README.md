# VIA Desktop

> [!IMPORTANT]
> This application is provided as-is, weekly builds are fully automated and there are no auto-updates included.

VIA Desktop is an Electron application designed to provide an offline experience for [VIA](https://github.com/the-via/app). This repository contains the source code and configuration files necessary to build and run the application.

The source code of this application relies fully on the bundled VIA application. But instead of hosting it on a webserver, this Electron application hosts it locally. Weekly builds are available via [GitHub releases](https://github.com/cebby2420/via-desktop/releases).

There are two parts to this:

- The Electron app opens the bundled VIA interface and refreshes the keyboard catalog in the background.
- A local web server serves VIA and the bundled or cached keyboard definitions.

VIA Desktop opens from disk, including on a first launch without internet
access. A cached catalog stays usable after it becomes a day old. The app
checks for updates after opening and keeps the last usable files if the check
fails. An updated catalog takes effect the next time you open the app.
**Settings → Force download definitions** applies a successful refresh to the
current window. **Settings → Only use local definitions** skips online checks.

When you connect a keyboard, VIA Desktop uses its cached or bundled definition
immediately. If neither copy exists, the app tries to download the definition.
You can also load a manufacturer's VIA JSON file while offline.

It's important to note that the VIA source code is changed very slightly to make sure that the hash of the definitions that is used for caching is not taking from the hardcoded value in the HTML. It's obviously possible that the definitions on the server may contain functionality that your local VIA build does not support. But at the moment we do not really care about that :)

### Downloading a release for macOS: _App is damaged and can't be opened_

Gatekeeper on macOS is gatekeeping you from opening this unsigned and unnotarised application. Use a command like the one below to allow your computer to open it.

```
xattr -d com.apple.quarantine /Users/<me>/Downloads/via-desktop.app
```

## Usage

In this fork, plug in the keyboard over USB and use **Load VIA definition
and connect** on the Configure screen. Choose the manufacturer's VIA
definition JSON, then pick the keyboard. VIA Desktop remembers the
definition. On later launches, use **Connect VIA keyboard**. The native
**Settings → Connect VIA keyboard…** menu opens the same picker.

The picker opens for an explicit connection request. You can leave
**Allow connecting to unknown devices** off. The desktop build includes
the Fira Sans fonts used for key legends, so the labels can draw offline.
[Discovery report #40](https://github.com/cebby2420/via-desktop/issues/40)

To start the application, run:

```sh
./build-via.sh
npm install
npm start
```

## Development

### Linting

To lint the codebase, run:

```sh
npm run lint
```

### Formatting

To format the codebase using Prettier, run:

```sh
npm run prettier
```

## Build

To build the application for distribution, run:

```sh
npm run make
```

The Windows test build used the web assets from the upstream
[v2026.5.18 portable package](https://github.com/cebby2420/via-desktop/releases/tag/v2026.5.18).
To build with the same web assets, copy that package's `resources/public`
directory to `public` in this checkout. Then run `npm ci` and
`npm run package -- --platform=win32 --arch=x64`. The app is generated
under `out/`. The bundled fonts have their own
[copyright and licence notices](desktop-fonts/README.md).

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.
