.PHONY: build check clean

build: public/index.html .vite/build/definitions
	@echo "You can now start the app with:"
	@echo "npm start"

.vite/build/definitions:
	mkdir -p .vite/build/definitions

public/index.html: check via-app via-app/src/utils/device-store.ts.old via-app/src/store/devicesThunk.ts.old
	cd via-app && npm install && npm run build
	cd via-app && cp -R dist/ ../public
	npm install

via-app/src/utils/device-store.ts.old:
	cd via-app && \
		sed -i.old 's|^\(\s*\)//\(.*fetch.*\)|\1\2|; s|^\(\s*\)\(const hash = document.getElementById.*\)|\1//\2|' src/utils/device-store.ts

via-app/src/store/devicesThunk.ts.old:
	cd via-app && \
		sed -i.old 's/dispatch(loadStoredCustomDefinitions/await dispatch(loadStoredCustomDefinitions/' src/store/devicesThunks.ts

via-app:
	git clone https://github.com/the-via/app via-app

check:
	which bun || ( echo "You must have bun installed in your PATH for this to work" && exit 1 )

clean:
	rm -rf via-app public node_modules .vite
