import * as T from "three";
import { createFingerboardLayout } from "./fretboard-layout.mjs";
import {
  normalizeLedBrightness,
  DEFAULT_LED_BRIGHTNESS,
} from "./led-brightness.mjs";

// World-space surface sampling keeps the generated hardware independent of GLB edits.
export function createFretboardLeds({ scene, model, report }) {
  model.updateWorldMatrix(true, true);
  const surfaces = [];
  model.traverseVisible((o) => {
    if (
      o.isMesh &&
      (!report.surfaceNames || report.surfaceNames.includes(o.name))
    )
      surfaces.push(o);
  });
  const fretCount = report.fretComponents.length - 1,
    total = (fretCount + 1) * 6;
  const bounds = new T.Box3().setFromObject(model),
    ray = new T.Raycaster(),
    mounts = [],
    indices = new Map();
  const layout = createFingerboardLayout(report);
  const radius = report.ledRadius ?? 0.017,
    normalMatrix = new T.Matrix3();
  const rayTop = (Number.isFinite(bounds.max.z) ? bounds.max.z : 1) + 1;
  function surfaceAt(x, y) {
    ray.set(new T.Vector3(x, y, rayTop), new T.Vector3(0, 0, -1));
    return ray.intersectObjects(surfaces, false)[0];
  }
  function mountAt(x, laneY) {
    const hit = surfaceAt(x, laneY),
      lip = radius * 1.05;
    if (!hit) return null;
    const supported = [
      [lip, 0],
      [-lip, 0],
      [0, lip],
      [0, -lip],
    ].every(([dx, dy]) => surfaceAt(x + dx, laneY + dy)?.object === hit.object);
    return supported ? hit : null;
  }
  // The first cell contains two hardware rows: open beside the nut, 1 beside wire 1.
  for (let lane = 0; lane < 6; lane++)
    for (let fret = 0; fret <= fretCount; fret++) {
      const row = layout.rowAt(fret),
        x = row.xs?.[lane] ?? row.x,
        y = row.ys[lane];
      const hit = mountAt(x, y);
      if (!hit) continue;
      const normal = hit.face.normal
        .clone()
        .applyNormalMatrix(
          normalMatrix.getNormalMatrix(hit.object.matrixWorld),
        );
      if (normal.z < 0) normal.negate();
      const position = hit.point.clone().addScaledVector(normal, 0.00025),
        index = mounts.length;
      mounts.push({
        string: 6 - lane,
        fret,
        position: position.toArray(),
        normal: normal.toArray(),
        surface: hit.object.name,
      });
      indices.set(`${6 - lane}:${fret}`, index);
    }
  const textureData = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4,
        a = Math.max(0, 1 - Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5));
      textureData.set([255, 255, 255, Math.round(255 * a * a)], i);
    }
  const glowTexture = new T.DataTexture(textureData, 32, 32);
  glowTexture.needsUpdate = true;
  // A narrow dark bore seam and a nearly flush frosted diffuser, not a metal button.
  const bezel = new T.InstancedMesh(
    new T.RingGeometry(radius * 0.97, radius * 1.045, 24),
    new T.MeshStandardMaterial({
      color: 0x18130f,
      metalness: 0,
      roughness: 0.93,
    }),
    mounts.length,
  );
  const lensGeometry = new T.SphereGeometry(1, 24, 12),
    emission = new T.InstancedBufferAttribute(
      new Float32Array(mounts.length * 3),
      3,
    ).setUsage(T.DynamicDrawUsage);
  lensGeometry.setAttribute("ledEmission", emission);
  const lensMaterial = new T.MeshPhysicalMaterial({
    color: 0x4a5052,
    roughness: 0.72,
    metalness: 0,
    specularIntensity: 0.25,
    clearcoat: 0.12,
    clearcoatRoughness: 0.65,
  });
  let brightness = DEFAULT_LED_BRIGHTNESS;
  const brightnessUniform = { value: brightness / 100 };
  // Keep PBR reflection in both states; only the internal emitter changes per lamp.
  lensMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.ledBrightness = brightnessUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 ledEmission;\nvarying vec3 vLedEmission;\nvarying float vLedFace;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLedEmission = ledEmission;\nvLedFace = max(0.0, normal.z);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float ledBrightness;\nvarying vec3 vLedEmission;\nvarying float vLedFace;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vLedEmission * ledBrightness * (0.3 + 0.7 * pow(clamp(vLedFace, 0.0, 1.0), 0.65));",
      );
  };
  lensMaterial.customProgramCacheKey = () =>
    "frosted-fingerboard-led-brightness-v3";
  const lens = new T.InstancedMesh(lensGeometry, lensMaterial, mounts.length);
  const maskMaterial = new T.ShaderMaterial({
    toneMapped: false,
    uniforms: { ledBrightness: brightnessUniform },
    vertexShader: `attribute vec3 ledEmission; uniform float ledBrightness; varying vec3 lightColor;
      void main(){lightColor=ledEmission*ledBrightness*max(0.0,normal.z);
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader:
      "varying vec3 lightColor; void main(){gl_FragColor=vec4(lightColor,1.0);}",
  });
  const glow = new T.InstancedMesh(
    new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.38,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    mounts.length,
  );
  bezel.name = "LED mounting seam";
  lens.name = "LED frosted diffuser";
  glow.name = "LED local light spill";
  const layers = [bezel, lens, glow],
    dummy = new T.Object3D(),
    axis = new T.Vector3(0, 0, 1),
    black = new T.Color(0);
  mounts.forEach((m, i) => {
    dummy.position.fromArray(m.position);
    dummy.quaternion.setFromUnitVectors(
      axis,
      new T.Vector3().fromArray(m.normal),
    );
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bezel.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(radius, radius, 0.0009);
    dummy.updateMatrix();
    lens.setMatrixAt(i, dummy.matrix);
    dummy.position.addScaledVector(new T.Vector3().fromArray(m.normal), 0.0012);
    dummy.scale.set(radius * 6.5, radius * 6.5, 1);
    dummy.updateMatrix();
    glow.setMatrixAt(i, dummy.matrix);
    glow.setColorAt(i, black);
  });
  layers.forEach((mesh) => {
    mesh.frustumCulled = false;
    scene.add(mesh);
  });
  let lit = new Map();
  function setBrightness(value) {
    brightness = normalizeLedBrightness(value);
    brightnessUniform.value = brightness / 100;
    // A colored halo remains legible as the emitter core gets brighter. The
    // gain stays separate from per-note colors, so paused lights update too.
    glow.material.opacity = 0.9 * Math.sqrt(brightness / 300);
  }
  setBrightness(brightness);
  function update(frame) {
    const next = new Map();
    for (const light of frame?.lights ?? []) {
      const index = indices.get(`${light.string}:${light.fret}`);
      if (index !== undefined) next.set(index, light.color);
    }
    let changed = false;
    for (const index of lit.keys())
      if (!next.has(index)) {
        emission.setXYZ(index, 0, 0, 0);
        glow.setColorAt(index, black);
        changed = true;
      }
    for (const [index, color] of next)
      if (lit.get(index) !== color) {
        const c = new T.Color(color);
        emission.setXYZ(index, c.r * 2.4, c.g * 2.4, c.b * 2.4);
        glow.setColorAt(index, c);
        changed = true;
      }
    if (changed) {
      emission.needsUpdate = true;
      glow.instanceColor.needsUpdate = true;
    }
    lit = next;
  }
  function getObstacles(camera, width, height) {
    const obstacles = [];
    for (const index of lit.keys()) {
      const p = new T.Vector3().fromArray(mounts[index].position),
        projected = p.clone().project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const edge = p
        .clone()
        .add(new T.Vector3(radius * 1.8, 0, 0))
        .project(camera);
      obstacles.push({
        x: ((projected.x + 1) * width) / 2,
        y: ((1 - projected.y) * height) / 2,
        radius: Math.max(5, (Math.abs(edge.x - projected.x) * width) / 2),
      });
    }
    return obstacles;
  }
  return {
    update,
    setBrightness,
    getObstacles,
    layout,
    bloomSource: { mesh: lens, material: maskMaterial, spill: glow },
    diagnostics: () => ({
      total,
      unmounted: total - mounts.length,
      lit: lit.size,
      brightness,
      mounts,
    }),
    dispose() {
      for (const mesh of layers) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
      maskMaterial.dispose();
      glowTexture.dispose();
    },
  };
}

// Badge centers are screen pixels, with y increasing downwards.
export function placeLedLabels(rects, obstacles, bounds) {
  const placed = rects.slice();
  for (let i = 0; i < placed.length; i++)
    placed[i] = avoidLedObstacles(
      placed[i],
      obstacles,
      bounds,
      placed.filter((_, j) => i !== j),
    );
  return placed;
}

export function avoidLedObstacles(rect, obstacles, bounds, reserved = []) {
  const pad = 3,
    halfW = rect.width / 2,
    halfH = rect.height / 2;
  const clampX = (x) => Math.max(halfW, Math.min(bounds.width - halfW, x)),
    clampY = (y) => Math.max(halfH, Math.min(bounds.height - halfH, y));
  const coversLamp = (x, y) =>
    obstacles.some(
      (o) =>
        Math.abs(x - o.x) < halfW + o.radius + pad &&
        Math.abs(y - o.y) < halfH + o.radius + pad,
    );
  if (!coversLamp(rect.x, rect.y)) return rect;
  const overlaps = (x, y) =>
    coversLamp(x, y) ||
    reserved.some(
      (r) =>
        Math.abs(x - r.x) < halfW + r.width / 2 + pad &&
        Math.abs(y - r.y) < halfH + r.height / 2 + pad,
    );
  const xs = [clampX(rect.x)],
    ys = [clampY(rect.y)];
  for (const o of obstacles) {
    xs.push(
      clampX(o.x - o.radius - halfW - pad),
      clampX(o.x + o.radius + halfW + pad),
    );
    ys.push(
      clampY(o.y - o.radius - halfH - pad),
      clampY(o.y + o.radius + halfH + pad),
    );
  }
  for (const r of reserved) {
    xs.push(
      clampX(r.x - r.width / 2 - halfW - pad),
      clampX(r.x + r.width / 2 + halfW + pad),
    );
    ys.push(
      clampY(r.y - r.height / 2 - halfH - pad),
      clampY(r.y + r.height / 2 + halfH + pad),
    );
  }
  xs.sort((a, b) => Math.abs(a - rect.x) - Math.abs(b - rect.x));
  ys.sort((a, b) => Math.abs(a - rect.y) - Math.abs(b - rect.y));
  let best = null,
    distance = Infinity;
  for (const x of xs) {
    if ((x - rect.x) ** 2 >= distance) break;
    for (const y of ys) {
      const d = (x - rect.x) ** 2 + (y - rect.y) ** 2;
      if (d >= distance) break;
      if (!overlaps(x, y)) {
        best = { ...rect, x, y };
        distance = d;
      }
    }
  }
  return best ?? rect;
}
