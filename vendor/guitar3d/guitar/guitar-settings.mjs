import { FINISH_TEXTURES } from "./guitar-textures.mjs";
export const GUITAR_SETTINGS_KEY = "litejam-play-model-settings-v1";
const ids = ["original", "rgb24", "a1", "rgb24m", "rgb24neos", "rgb24neot"],
  parts = ["body", "neck", "head"],
  roles = [...parts, "pickguard", "hardware"];
function sanitize(value) {
  const result = {
    colorVersion: 2,
    modelId: ids.includes(value?.modelId) ? value.modelId : "original",
    finishes: Object.fromEntries(ids.map((id) => [id, {}])),
    textures: {},
  };
  for (const id of ids)
    for (const role of roles) {
      const c = value?.finishes?.[id]?.[role];
      if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
        result.finishes[id][role] = c.toLowerCase();
    }
  // Before independent colors, A1 cached one shared shell color. Copy it once,
  // without changing which regions are currently native, painted or textured.
  if (value?.colorVersion !== 2 && result.finishes.a1.body)
    for (const part of ["neck", "head"])
      result.finishes.a1[part] ??= result.finishes.a1.body;
  for (const id of ids) {
    const old = value?.textures?.[id],
      structured = old && typeof old === "object" && !Array.isArray(old);
    result.textures[id] = Object.fromEntries(
      parts.map((part) => {
        const choice = structured ? old[part] : old;
        if (Object.hasOwn(FINISH_TEXTURES, choice)) return [part, choice];
        return [
          part,
          (structured ? choice === "solid" : !!result.finishes[id][part])
            ? "solid"
            : "original",
        ];
      }),
    );
  }
  return result;
}
export function readGuitarSettings(storage) {
  try {
    return sanitize(
      JSON.parse(
        (storage ?? globalThis.localStorage).getItem(GUITAR_SETTINGS_KEY),
      ),
    );
  } catch {
    return sanitize(null);
  }
}
export function saveGuitarSettings(value, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      GUITAR_SETTINGS_KEY,
      JSON.stringify(sanitize(value)),
    );
  } catch {}
}
