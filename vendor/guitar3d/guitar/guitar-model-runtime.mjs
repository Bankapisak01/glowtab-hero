import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getModelDefinition, prepareModel } from "./guitar-models.mjs";
import { createFinishes } from "./guitar-finishes.mjs";
import { createFretboardLeds } from "./fretboard-led-scene.mjs";
import { createStringMotion } from "./string-motion.mjs";

export function disposeModelObject(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    images = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) materials.add(m);
  });
  for (const m of materials)
    for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
  for (const t of textures) {
    if (t.source?.data) images.add(t.source.data);
    t.dispose();
  }
  for (const i of images) i.close?.();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  root.removeFromParent();
}
export async function loadGuitarModel(id) {
  const definition = getModelDefinition(id);
  const results = await Promise.allSettled([
    fetch(definition.report).then((r) => {
      if (!r.ok) throw Error("Could not load guitar calibration");
      return r.json();
    }),
    new GLTFLoader().loadAsync(definition.url),
  ]);
  const failed = results.find((r) => r.status === "rejected");
  if (failed) {
    if (results[1].status === "fulfilled")
      disposeModelObject(results[1].value.scene);
    throw failed.reason;
  }
  const report = { ...results[0].value, surfaceNames: definition.surfaceNames },
    root = results[1].value.scene;
  const group = new T.Group(),
    frame = prepareModel(root, definition);
  group.add(frame);
  let leds,
    finishes,
    strings = [],
    disposed = false;
  try {
    if (report.strings?.length !== 6 || report.fretComponents?.length < 2)
      throw Error("Incomplete string or fret calibration");
    leds = createFretboardLeds({ scene: group, model: frame, report });
    if (leds.diagnostics().unmounted) throw Error("Incomplete LED placement");
    finishes = createFinishes(frame, definition.finishRoles);
    strings = createStrings(group);
  } catch (error) {
    leds?.dispose();
    finishes?.dispose();
    disposeModelObject(root);
    throw error;
  }
  const bundle = {
    id,
    definition,
    group,
    frame,
    report,
    leds,
    finishes,
    strings,
    motion: createStringMotion(report, leds.layout),
    bloom: null,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      bundle.bloom?.dispose();
      leds.dispose();
      finishes.dispose();
      for (const st of strings) {
        st.texture.dispose();
        st.mesh.geometry.dispose();
        st.material.dispose();
        st.marker.material.dispose();
        if (st.leader) {
          st.leader.geometry.dispose();
          st.leader.material.dispose();
        }
      }
      disposeModelObject(root);
      group.clear();
    },
  };
  return bundle;
}
function createStrings(group) {
  const strings = [];
  for (let s = 0; s < 6; s++) {
    const segments = 256,
      sides = 8,
      positions = new Float32Array((segments + 1) * sides * 3),
      normals = new Float32Array(positions.length),
      indices = [];
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < sides; j++) {
        const k = i * sides + j,
          n = i * sides + ((j + 1) % sides);
        indices.push(k, n, k + sides, n, n + sides, k + sides);
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
    );
    geometry.setAttribute("normal", new T.BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    const material = new T.MeshStandardMaterial({
      color: 0xbfc4ca,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = `live_string_${6 - s}`;
    group.add(mesh);
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 128;
    const texture = new T.CanvasTexture(labelCanvas);
    texture.colorSpace = T.SRGBColorSpace;
    const marker = new T.Sprite(
      new T.SpriteMaterial({ map: texture, depthTest: false }),
    );
    marker.scale.set(0.37, 0.185, 1);
    marker.renderOrder = 10;
    marker.visible = false;
    group.add(marker);
    strings.push({
      mesh,
      material,
      positions,
      normals,
      segments,
      sides,
      radius: 0.0095 - s * 0.0011,
      marker,
      labelCanvas,
      texture,
      label: "",
    });
  }
  return strings;
}
