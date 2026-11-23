import * as T from "three";
import { loadGuitarModel } from "./guitar-model-runtime.mjs";
import { createModelSwitcher } from "./guitar-model-switch.mjs";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STRING_COLORS } from "./fretboard-led.mjs";
import { placeLedLabels } from "./fretboard-led-scene.mjs";
import { createLedBloom } from "./led-bloom.mjs?v=bloom-2";

export const colors = STRING_COLORS;
export async function createGuitarStage(
  canvas,
  { autoRender = true, labels = true } = {},
) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(34, 1, 0.01, 100),
    controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  const pmrem = new T.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff, 0x475574, 0.7));
  const light = new T.DirectionalLight(0xffffff, 1.6);
  light.position.set(-3, 4, 10);
  scene.add(light);
  const qa = new URLSearchParams(location.search).has("qa");
  let active = null,
    brightness = 150,
    bloomEnabled = true,
    neckView = true,
    disposed = false;
  let lastStates = Array(6).fill(null),
    lastTick = 0,
    lastFrame = { lights: [] };
  let dimensions = { width: 1, height: 1 };
  const switcher = createModelSwitcher({
    load: loadGuitarModel,
    install(next, previous) {
      next.leds.setBrightness(brightness);
      next.bloom = createLedBloom({ renderer, scene, camera, leds: next.leds });
      next.bloom.setEnabled(bloomEnabled);
      next.bloom.setSize(
        dimensions.width,
        dimensions.height,
        renderer.getPixelRatio(),
      );
      scene.add(next.group);
      previous?.group.removeFromParent();
      active = next;
      view(neckView);
      update(lastStates, lastTick, lastFrame);
    },
  });
  function markerLabel(st, label, s) {
    if (st.label === label) return;
    st.label = label;
    const ctx = st.labelCanvas.getContext("2d");
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = "#0d1726";
    ctx.strokeStyle = `#${colors[s].toString(16)}`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(10, 9, 236, 110, 52);
    ctx.fill();
    ctx.stroke();
    ctx.font = "bold 68px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText(label, 128, 65);
    st.texture.needsUpdate = true;
  }
  function arrangeMarkers() {
    const { strings, leds, group } = active;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    const rows = strings
      .filter((st) => st.marker.visible)
      .map((st) => {
        const b = st.marker,
          p = b.position.clone().project(camera),
          anchor = b.position.clone();
        const depth = -b.position
            .clone()
            .applyMatrix4(camera.matrixWorldInverse).z,
          h =
            (2 * depth * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * 26) /
            Math.max(1, height);
        b.scale.set(h * 1.8, h, 1);
        return {
          b,
          st,
          p,
          anchor,
          rect: {
            x: ((p.x + 1) * width) / 2,
            y: ((1 - p.y) * height) / 2,
            width: 46.8,
            height: 26,
          },
        };
      });
    const groups = [];
    for (const row of rows) {
      const matches = groups.filter((g) =>
        g.some(
          (r) =>
            Math.abs(r.rect.x - row.rect.x) < 50 &&
            Math.abs(r.rect.y - row.rect.y) < 30,
        ),
      );
      if (!matches.length) groups.push([row]);
      else {
        const group = matches[0];
        group.push(row);
        for (const other of matches.slice(1)) {
          group.push(...other);
          groups.splice(groups.indexOf(other), 1);
        }
      }
    }
    for (const group of groups) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.rect.y - b.rect.y);
      const center = group.reduce((sum, r) => sum + r.rect.y, 0) / group.length;
      group.forEach(
        (r, i) => (r.rect.y = center + (i - (group.length - 1) / 2) * 30),
      );
    }
    const placed = placeLedLabels(
      rows.map((r) => r.rect),
      leds.getObstacles(camera, width, height),
      { width, height },
    );
    for (let i = 0; i < rows.length; i++) {
      const { b, st, p, anchor } = rows[i],
        r = placed[i];
      p.x = (r.x * 2) / width - 1;
      p.y = 1 - (r.y * 2) / height;
      b.position.copy(p.unproject(camera));
      if (b.position.distanceTo(anchor) < 0.005) continue;
      if (!st.leader) {
        st.leader = new T.Line(
          new T.BufferGeometry(),
          new T.LineBasicMaterial({
            color: 0xa3b4be,
            transparent: true,
            opacity: 0.6,
            depthTest: false,
          }),
        );
        st.leader.renderOrder = 9;
        st.leader.frustumCulled = false;
        group.add(st.leader);
      }
      st.leader.geometry.setFromPoints([anchor, b.position]);
      st.leader.visible = true;
    }
  }
  function update(states, tick, ledFrame) {
    lastStates = states;
    lastTick = tick;
    lastFrame = ledFrame;
    if (!active || disposed) return;
    const { strings, leds, motion, bloom } = active;
    leds.update(ledFrame);
    controls.update();
    camera.updateMatrixWorld();
    for (let s = 0; s < 6; s++) {
      const st = strings[s],
        pose = motion.pose(s, states[s], tick),
        active = pose.active,
        start = pose.start,
        end = pose.end,
        point = {};
      if (st.leader) st.leader.visible = false;
      st.material.color.setHex(active ? colors[s] : 0xbfc4ca);
      st.material.emissive.setHex(active ? colors[s] : 0);
      st.material.emissiveIntensity = active ? 0.55 : 0;
      st.marker.visible = labels && Boolean(active);
      if (active) {
        const direction =
          (active.note.slideTarget?.fret ?? active.note.fret) -
          active.note.fret;
        const text = active.note.isDead
          ? "×"
          : active.sliding
            ? `${active.note.fret}${direction < 0 ? "↘" : "↗"}`
            : String(active.note.fret);
        markerLabel(st, text, s);
        const p = motion.marker(pose);
        st.marker.position.set(p.x, p.y, p.z);
      }
      for (let i = 0; i <= st.segments; i++) {
        const x = T.MathUtils.lerp(start, end, i / st.segments),
          p = motion.point(pose, x, point),
          yy = p.y,
          zz = p.z;
        for (let k = 0; k < st.sides; k++) {
          const angle = (k / st.sides) * Math.PI * 2,
            idx = (i * st.sides + k) * 3;
          st.positions[idx] = x;
          st.positions[idx + 1] = yy + st.radius * Math.cos(angle);
          st.positions[idx + 2] = zz + st.radius * Math.sin(angle);
          st.normals[idx] = 0;
          st.normals[idx + 1] = Math.cos(angle);
          st.normals[idx + 2] = Math.sin(angle);
        }
      }
      st.mesh.geometry.attributes.position.needsUpdate = true;
      st.mesh.geometry.attributes.normal.needsUpdate = true;
    }
    if (labels) arrangeMarkers();
    if (autoRender) {
      renderer.info.reset();
      bloom.render();
    }
    if (qa) {
      canvas.dataset.model = JSON.stringify({
        id: active.id,
        fretCount: active.report.fretComponents.length - 1,
        finishes: active.finishes.supported,
        texture: active.finishes.textureId,
        textures: active.finishes.textureIds,
        colors: Object.fromEntries(
          ["body", "neck", "head"].map((part) => [
            part,
            active.finishes.color("body", { part }),
          ]),
        ),
        memory: { ...renderer.info.memory },
      });
    }
    if (qa) canvas.dataset.bloom = JSON.stringify(bloom.diagnostics());
    if (qa) {
      const { total, unmounted, lit, brightness } = leds.diagnostics();
      canvas.dataset.ledGeometry = JSON.stringify({
        total,
        unmounted,
        lit,
        brightness,
        drawCalls: renderer.info.render.calls,
      });
      canvas.dataset.motion = JSON.stringify(
        states.map((st, lane) => {
          if (!st) return null;
          const p = motion.pose(lane, st, tick);
          return {
            string: 6 - lane,
            fret: p.fret,
            contact: p.contact,
            bend: p.bend,
            visible: Boolean(p.active),
          };
        }),
      );
    }
  }
  function view(neck) {
    neckView = neck;
    if (!active) return;
    const frets = active.report.fretComponents,
      b = active.report.guitarBounds;
    const x = neck
      ? (frets[0].center[0] + frets.at(-1).center[0]) / 2
      : (b.min[0] + b.max[0]) / 2;
    const y = (frets[0].center[1] + frets.at(-1).center[1]) / 2;
    const span = neck
      ? frets.at(-1).center[0] - frets[0].center[0]
      : b.max[0] - b.min[0];
    const z = Math.max(
      neck ? 6.3 : 12.8,
      (span / Math.max(0.6, camera.aspect)) * 1.8,
    );
    controls.target.set(x, y, 0);
    camera.position.set(x, y - (neck ? 3.08 : 4.08), z);
    controls.update();
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    dimensions = { width: r.width, height: r.height };
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    active?.bloom.setSize(r.width, r.height, renderer.getPixelRatio());
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
    view(neckView);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  try {
    await switcher.select("original");
  } catch (error) {
    observer.disconnect();
    controls.dispose();
    environment.dispose();
    renderer.dispose();
    throw error;
  }
  return {
    scene,
    camera,
    controls,
    renderer,
    get model() {
      return active;
    },
    render() {
      camera.updateMatrixWorld();
      renderer.info.reset();
      active?.bloom.render();
    },
    update,
    view,
    setModel: (id) => switcher.select(id),
    get modelId() {
      return active.id;
    },
    get fretCount() {
      return active.report.fretComponents.length - 1;
    },
    get strings() {
      return active.strings;
    },
    get finishSupport() {
      return { ...active.finishes.supported };
    },
    finishColor: (role, options) => active.finishes.color(role, options),
    setFinish: (role, color, options) =>
      active.finishes.set(role, color, options),
    resetFinishes: () => active.finishes.reset(),
    get textureId() {
      return active.finishes.textureId;
    },
    get textureIds() {
      return active.finishes.textureIds;
    },
    get textureSupport() {
      return active.finishes.textureSupport;
    },
    setOriginalPart: (part) => active.finishes.setOriginalPart(part),
    setTexture: (id, part) => active.finishes.setTexture(id, part),
    cancelPendingTexture: () => active.finishes.cancelPending(),
    setOriginalBody: () => active.finishes.setOriginalBody(),
    setLedBrightness(value) {
      brightness = value;
      active?.leds.setBrightness(value);
    },
    setBloomEnabled(value) {
      bloomEnabled = Boolean(value);
      active?.bloom.setEnabled(bloomEnabled);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      switcher.dispose();
      controls.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
