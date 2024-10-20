# VIA Desktop

VIA Desktop is an Electron application designed to provide an offline experience for [VIA](https://github.com/the-via/app). This repository contains the source code and configuration files necessary to build and run the application.

The source code of this application relies fully on the bundled VIA application. But instead of hosting it on a webserver, this Electron application hosts it locally.

There are two parts to this:

- The Electron application that makes sure the latest keyboard definition list is downloaded
- A proxy webserver that downloads the latest definition for your keyboard, and hosts the VIA single-page-application to be shown in the built-in browser

By default the definitions from VIA are included in the binary, so you do not necessarily need an internet connection. But having one makes sure that your definition gets updated automatically.

It's important to note that the VIA source code is changed very slightly to make sure that the hash of the definitions that is used for caching is not taking from the hardcoded value in the HTML. It's obviously possible that the definitions on the server may contain functionality that your local VIA build does not support. But at the moment we do not really care about that :)

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
