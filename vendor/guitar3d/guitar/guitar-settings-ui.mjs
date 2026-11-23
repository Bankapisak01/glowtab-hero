import { readGuitarSettings, saveGuitarSettings } from "./guitar-settings.mjs";
import { FINISH_TEXTURES } from "./guitar-textures.mjs";
const roles = ["pickguard", "hardware"],
  parts = ["body", "neck", "head"];
const nativeParts = () => Object.fromEntries(parts.map((p) => [p, "original"]));
export function createGuitarSettingsUI(
  guitar,
  {
    document: doc = globalThis.document,
    storage,
    onModelChange = () => {},
    onModelLoadingChange = () => {},
  } = {},
) {
  const $ = (id) => doc.getElementById(id),
    state = readGuitarSettings(storage);
  let sequence = 0,
    modelLoading = false;
  const epochs = { body: 0, neck: 0, head: 0 },
    pending = {};
  const names = {
    original: "Stratocaster",
    rgb24: "LiteJam RGB24",
    a1: "LiteJam A1",
    rgb24m: "LiteJam RGB24M Nature",
    rgb24neos: "LiteJam RGB24NEOS Black",
    rgb24neot: "LiteJam RGB24NEOT Green",
  };
  const control = (id, part) => $(id + (part === "body" ? "" : "-" + part));
  const supports = (part) =>
    guitar.textureSupport?.[part] ??
    (part === "body" && guitar.finishSupport.body);
  const textures = () =>
    guitar.textureIds ?? {
      body: guitar.textureId ?? null,
      neck: null,
      head: null,
    };
  function save() {
    saveGuitarSettings(state, storage);
  }
  function invalidate(part) {
    epochs[part]++;
    delete pending[part];
  }
  function invalidateAll() {
    parts.forEach(invalidate);
  }
  function native(part) {
    if (guitar.setOriginalPart) guitar.setOriginalPart(part);
    else if (part === "body") guitar.setOriginalBody?.();
  }
  function clearStatus() {
    for (const part of parts) control("texture-status", part).textContent = "";
  }
  function sync(loading = modelLoading) {
    // Transport readiness includes independent texture requests, so a late
    // material commit cannot arrive after the player has begun a new round.
    onModelLoadingChange(modelLoading || Object.keys(pending).length > 0);
    const id = guitar.modelId,
      actual = textures();
    for (const role of roles) {
      const node = $("finish-" + role);
      node.disabled = loading || !guitar.finishSupport[role];
      node.value = state.finishes[id][role] ?? guitar.finishColor(role);
    }
    for (const part of parts) {
      const color = $("finish-" + part);
      color.disabled = loading || !supports(part);
      color.value =
        state.finishes[id][part] ?? guitar.finishColor("body", { part });
      $("finish-" + part + "-label").textContent = {
        body: "Body color",
        neck: "Neck color",
        head: "Headstock color",
      }[part];
      const node = control("finish-texture", part),
        preview = control("texture-preview", part),
        texture = actual[part],
        stored = state.textures[id][part];
      const mode =
        texture ??
        (stored === "solid" ||
        (stored !== "original" && state.finishes[id][part])
          ? "solid"
          : "original");
      node.innerHTML =
        '<option value="original">Original material</option><option value="solid">Solid color</option>' +
        Object.values(FINISH_TEXTURES)
          .map((t) => `<option value="${t.id}">${t.name}</option>`)
          .join("");
      node.disabled = loading || !supports(part);
      node.value = pending[part] ?? mode;
      control("finish-texture-label", part).textContent = {
        body: "Body texture",
        neck: "Neck texture",
        head: "Headstock texture",
      }[part];
      preview.hidden = !texture;
      if (texture) {
        preview.src = FINISH_TEXTURES[texture].url("baseColor");
        preview.alt = FINISH_TEXTURES[texture].name;
      }
    }
    $("finish-reset").disabled = loading;
    $("guitar-model").disabled = false;
    $("finish-note").textContent =
      (id === "rgb24m" ? "Base wood color preview. " : "") +
      "Customize each part independently. Paint replaces only that part’s texture; the fretboard and LEDs stay original.";
  }
  function restoreSaved(request, id) {
    invalidateAll();
    guitar.resetFinishes();
    for (const role of roles) {
      const color = state.finishes[id][role];
      if (color && guitar.finishSupport[role]) guitar.setFinish(role, color);
    }
    return Promise.all(
      parts.map(async (part) => {
        const epoch = epochs[part],
          mode = state.textures[id][part],
          status = control("texture-status", part);
        status.textContent = "";
        if (!supports(part)) return;
        if (mode === "original") {
          native(part);
          return;
        }
        const color = state.finishes[id][part];
        if (color || mode === "solid")
          guitar.setFinish("body", color ?? "#888888", { part });
        if (mode === "solid") return;
        // A failed saved pattern keeps this region's cached paint, or native if none.
        pending[part] = mode;
        status.textContent = "Restoring your finish…";
        try {
          const result = await guitar.setTexture(mode, part);
          if (
            request !== sequence ||
            epoch !== epochs[part] ||
            guitar.modelId !== id ||
            !result.committed
          )
            return;
          delete pending[part];
          status.textContent = FINISH_TEXTURES[mode].name;
          sync();
        } catch (error) {
          if (
            request !== sequence ||
            epoch !== epochs[part] ||
            guitar.modelId !== id
          )
            return;
          delete pending[part];
          status.textContent =
            "Saved texture unavailable. Your previous finish is still usable.";
          sync();
        }
      }),
    );
  }
  async function select(id) {
    const request = ++sequence;
    invalidateAll();
    guitar.cancelPendingTexture?.();
    modelLoading = true;
    onModelLoadingChange(true);
    clearStatus();
    sync();
    $("model-status").textContent = "Loading guitar…";
    $("guitar-model").value = id;
    try {
      const result = await guitar.setModel(id);
      if (request !== sequence || !result.committed) return;
      state.modelId = guitar.modelId;
      save();
      $("guitar-model").value = guitar.modelId;
      onModelChange();
      await restoreSaved(request, guitar.modelId);
      if (request !== sequence) return;
      modelLoading = false;
      $("model-status").textContent = names[guitar.modelId];
      sync();
    } catch (error) {
      if (request !== sequence) return;
      modelLoading = false;
      $("guitar-model").value = guitar.modelId;
      $("model-status").textContent =
        "Model unavailable. Keeping your current guitar.";
      sync();
    } finally {
      if (request === sequence) onModelLoadingChange(false);
    }
  }
  async function chooseTexture(id, part = "body") {
    if (!parts.includes(part) || modelLoading || !supports(part)) return;
    const epoch = ++epochs[part],
      modelId = guitar.modelId,
      status = control("texture-status", part);
    delete pending[part];
    if (id === "original" || id === "solid") {
      if (id === "original") native(part);
      else {
        const color =
          state.finishes[modelId][part] ?? guitar.finishColor("body", { part });
        guitar.setFinish("body", color, { part });
        state.finishes[modelId][part] = color;
      }
      state.textures[modelId][part] = id;
      state.modelId = modelId;
      save();
      status.textContent = "";
      sync();
      return;
    }
    if (!Object.hasOwn(FINISH_TEXTURES, id)) {
      sync();
      return;
    }
    pending[part] = id;
    onModelLoadingChange(true);
    control("finish-texture", part).value = id;
    status.textContent = "Loading texture…";
    try {
      const result = await guitar.setTexture(id, part);
      if (
        epoch !== epochs[part] ||
        modelId !== guitar.modelId ||
        !result.committed
      )
        return;
      delete pending[part];
      state.textures[modelId][part] = id;
      state.modelId = modelId;
      save();
      status.textContent = FINISH_TEXTURES[id].name;
      sync();
    } catch (error) {
      if (epoch !== epochs[part] || modelId !== guitar.modelId) return;
      delete pending[part];
      status.textContent = "Texture unavailable. Keeping the current finish.";
      sync();
    }
  }
  for (const role of roles)
    $("finish-" + role).oninput = () => {
      const node = $("finish-" + role);
      if (node.disabled) return;
      if (guitar.setFinish(role, node.value) !== false) {
        state.finishes[guitar.modelId][role] = node.value;
        state.modelId = guitar.modelId;
        save();
        sync();
      }
    };
  for (const part of parts)
    $("finish-" + part).oninput = () => {
      const node = $("finish-" + part);
      if (node.disabled) return;
      if (guitar.setFinish("body", node.value, { part }) !== false) {
        invalidate(part);
        state.textures[guitar.modelId][part] = "solid";
        state.finishes[guitar.modelId][part] = node.value;
        control("texture-status", part).textContent = "";
        state.modelId = guitar.modelId;
        save();
        sync();
      }
    };
  $("finish-reset").onclick = () => {
    if (modelLoading) return;
    invalidateAll();
    guitar.resetFinishes();
    state.finishes[guitar.modelId] = {};
    state.textures[guitar.modelId] = nativeParts();
    clearStatus();
    save();
    sync();
  };
  for (const part of parts)
    control("finish-texture", part).onchange = () =>
      chooseTexture(control("finish-texture", part).value, part);
  $("guitar-model").onchange = () => select($("guitar-model").value);
  onModelLoadingChange(true);
  const initial = restoreSaved(sequence, guitar.modelId);
  let ready;
  if (state.modelId !== guitar.modelId)
    ready = Promise.all([initial, select(state.modelId)]);
  else {
    $("guitar-model").value = guitar.modelId;
    $("model-status").textContent = names[guitar.modelId];
    sync();
    ready = initial.finally(() => {
      if (sequence === 0) onModelLoadingChange(false);
    });
  }
  return { ready, select, chooseTexture };
}
