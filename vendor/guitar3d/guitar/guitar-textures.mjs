import { assetUrl } from "../app/assets.mjs";
import * as T from "three";

// Display-unit scale/orientation for appearance trials, not manufacturing specs.
export const FINISH_TEXTURES = Object.freeze(
  Object.fromEntries(
    [
      ["white_maple_veneer", "White Maple", 9, 0],
      ["ash_veneer", "Ash", 9, 0],
      ["walnut_veneer", "Walnut", 12, Math.PI / 2],
      ["sapele_veneer", "Sapele", 6, Math.PI / 2],
      ["rosewood_veneer_02", "Rosewood", 9, 0],
      ["black_walnut_veneer_02", "Black Walnut", 9, 0],
      ["carbon_weave", "Carbon Weave", 0.65, 0],
    ].map(([id, name, tileSize, rotation]) => [
      id,
      Object.freeze({
        id,
        name,
        tileSize,
        rotation,
        normalScale: 0.12,
        roughness: id === "carbon_weave" ? 0.42 : 0.6,
        url: (channel) => assetUrl(`finishes/${id}/${channel}.jpg`),
      }),
    ]),
  ),
);

export async function loadFinishTexture(
  id,
  { loadMap = (url) => new T.TextureLoader().loadAsync(url) } = {},
) {
  const definition = Object.hasOwn(FINISH_TEXTURES, id)
    ? FINISH_TEXTURES[id]
    : null;
  if (!definition) throw Error("Unknown finish texture");
  const channels = [
    ["map", "baseColor"],
    ["normalMap", "normalGL"],
    ["roughnessMap", "roughness"],
  ];
  const results = await Promise.allSettled(
    channels.map(([, channel]) => loadMap(definition.url(channel))),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed) {
    for (const r of results) if (r.status === "fulfilled") r.value.dispose();
    throw failed.reason;
  }
  const maps = {};
  // These generic OpenGL maps use our generated UVs, not native GLTF UVs.
  // Flip the image on upload so normal green agrees with the surface's +V slope.
  results.forEach((r, i) => {
    const t = r.value;
    t.colorSpace = i === 0 ? T.SRGBColorSpace : T.NoColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.flipY = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    maps[channels[i][0]] = t;
  });
  let disposed = false;
  return {
    id,
    definition,
    maps,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const t of Object.values(maps)) t.dispose();
    },
  };
}
