export const requestViaKeyboard = `async (filter, rescan) => {
  const [device] = await navigator.hid.requestDevice({filters: [filter]});
  if (!device) return false;
  if (rescan) navigator.hid.dispatchEvent(new HIDConnectionEvent("connect", {device}));
  return true;
}`;

// This is the default idb-keyval store used by VIA's Design importer.
export const storeViaDefinition = `async (definition, version) => {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open("keyval-store");
    open.onupgradeneeded = () => open.result.createObjectStore("keyval");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
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
