# VIA Desktop

> [!IMPORTANT]
> This application is provided as-is and weekly builds are fully automated.

VIA Desktop is an Electron application designed to provide an offline-capable desktop experience for [VIA](https://github.com/the-via/app). Weekly builds are available via [GitHub releases](https://github.com/cebby2420/via-desktop/releases).

There are two parts to this:

- The Electron application that hosts VIA locally and refreshes the keyboard catalog in the background
- A local HTTP server that serves VIA, bundled Fira Sans fonts, and cached or bundled keyboard definitions

VIA Desktop starts immediately from bundled or cached definitions and works offline. On first startup, it asks whether to enable network downloads of keyboard definitions. Network access remains disabled unless the user explicitly enables it. **Settings → Only use local definitions** can also disable or re-enable network checks, and **Settings → Force download definitions** refreshes immediately when network access is enabled.

### Unknown / Custom Keyboards

Keyboards in VIA's built-in catalog connect automatically. For keyboards not in the catalog (e.g. using a manufacturer JSON uploaded in VIA's Design tab), click **Authorize device** (or **Authorize New**) in VIA to approve that specific keyboard in the native picker. Approved devices are remembered across launches and can be reset via **Settings → Clear allowed unknown devices**.

### Downloading a release for macOS: _App is damaged and can't be opened_

Gatekeeper on macOS blocks opening unsigned and unnotarised applications. Use the command below to allow macOS to open it:

```sh
xattr -d com.apple.quarantine /Users/<me>/Downloads/via-desktop.app
```

### Linux USB permissions

On Linux, grant your user read/write access to your keyboard's `/dev/hidraw*` device via `udev` rules. See the [QMK Linux udev instructions](https://docs.qmk.fm/faq_build#linux-udev-rules).

## Usage

To start the application locally:

```sh
./build-via.sh
npm install
npm start
```

## Development

### Linting, Formatting, Typechecking & Tests

```sh
npm run lint
npm run prettier:check
npx tsc --noEmit
npm test
```

To auto-format with Prettier:

```sh
npm run prettier
```

## Build

To build the application for distribution:

```sh
npm run make
```

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.
