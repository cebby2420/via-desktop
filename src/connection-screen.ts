export const requestViaKeyboard = `async (filter, reuseGrant) => {
  // A definition may be imported immediately after granting access to a
  // keyboard. Reuse that grant for the matching device.
  const granted = !reuseGrant ? undefined : (await navigator.hid.getDevices()).find(device =>
    device.vendorId === filter.vendorId && device.productId === filter.productId &&
    device.collections.some(({usagePage, usage}) => usagePage === filter.usagePage && usage === filter.usage)
  );
  const device = granted ?? (await navigator.hid.requestDevice({filters: [filter]}))[0];
  if (!device) return null;
  return device.vendorId * 65536 + device.productId;
}`;

// This is the default idb-keyval store used by VIA's Design importer.
const openViaDefinitions = `() => new Promise((resolve, reject) => {
    const open = indexedDB.open("keyval-store");
    open.onupgradeneeded = () => open.result.createObjectStore("keyval");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  })`;

export const hasStoredViaDefinition = `async (id) => {
  const db = await (${openViaDefinitions})();
  try {
    const store = db.transaction("keyval").objectStore("keyval");
    const entries = await Promise.all([id, String(id)].map(key =>
      new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
    ));
    return entries.some(entry => entry?.v2 || entry?.v3);
  } finally {
    db.close();
  }
}`;

export const storeViaDefinition = `async (definition, version) => {
  const db = await (${openViaDefinitions})();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("keyval", "readwrite");
      const store = transaction.objectStore("keyval");
      const id = definition.vendorProductId;
      const existing = store.get(id);
      existing.onsuccess = () => store.put({...existing.result, [version]: definition}, id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}`;

export const installConnectionControl = `(() => {
  const actions = document.createElement("div");
  actions.style.cssText = "display:grid;justify-items:center;gap:8px;text-align:center;font-size:14px;margin-top:12px;max-width:570px";
  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;flex-wrap:wrap;justify-content:center;gap:8px";
  function makeButton(text) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.style.cssText = "font:inherit;padding:10px 16px;cursor:pointer;border-radius:4px;border:1px solid currentColor;background:var(--color_accent,#dcae9f);color:var(--color_inside-accent,#181818)";
    return button;
  }
  const load = makeButton("Load VIA definition and connect");
  const connect = makeButton("Connect VIA keyboard");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  file.setAttribute("aria-label", "VIA keyboard definition");
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  buttons.append(load, connect);
  actions.append(buttons, file, status);

  async function run(action) {
    load.disabled = connect.disabled = true;
    status.textContent = "";
    try {
      status.textContent = (await action()).message;
    } catch {
      status.textContent = "VIA could not connect. Check the USB cable and try again.";
    } finally {
      load.disabled = connect.disabled = false;
    }
  }
  load.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const chosen = file.files[0];
    file.value = "";
    if (chosen) run(async () => window.viaDesktop.loadAndConnect(await chosen.text()));
  });
  connect.addEventListener("click", () => run(() => window.viaDesktop.connect()));

  const sync = () => {
    const loader = document.querySelector('[data-tid="loading-message"]');
    if (!loader) actions.remove();
    else if (actions.parentElement !== loader) loader.append(actions);
  };
  new MutationObserver(sync).observe(document.body, {childList:true, subtree:true});
  sync();
})()`;
