# VIA Desktop

> [!IMPORTANT]
> This application is provided as-is, daily builds are fully automated and there are no auto-updates included.

VIA Desktop is an Electron application designed to provide an offline experience for [VIA](https://github.com/the-via/app). This repository contains the source code and configuration files necessary to build and run the application.

The source code of this application relies fully on the bundled VIA application. But instead of hosting it on a webserver, this Electron application hosts it locally. Daily builds are available via [GitHub releases](https://github.com/cebby2420/via-desktop/releases).

There are two parts to this:

- The Electron application that makes sure the latest keyboard definition list is downloaded
- A proxy webserver that downloads the latest definition for your keyboard, and hosts the VIA single-page-application to be shown in the built-in browser

By default the definitions from VIA are included in the binary, so you do not necessarily need an internet connection. But having one makes sure that your definition gets updated automatically.

It's important to note that the VIA source code is changed very slightly to make sure that the hash of the definitions that is used for caching is not taking from the hardcoded value in the HTML. It's obviously possible that the definitions on the server may contain functionality that your local VIA build does not support. But at the moment we do not really care about that :)

### Downloading a release for macOS: _App is damaged and can't be opened_

Gatekeeper on macOS is gatekeeping you from opening this unsigned and unnotarised application. Use a command like the one below to allow your computer to open it.

```
xattr -d com.apple.quarantine /Users/<me>/Downloads/via-desktop.app
```

## Usage

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

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.
