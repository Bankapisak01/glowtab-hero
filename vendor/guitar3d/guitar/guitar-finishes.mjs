import { loadFinishTexture } from "./guitar-textures.mjs";
import { projectFinishGeometry } from "./finish-projection.mjs";
export const TEXTURE_PARTS = ["body", "neck", "head"];
const validColor = (value) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
export function createFinishes(
  root,
  roles,
  { loadTexture = loadFinishTexture } = {},
) {
  const entries = [],
    supported = { body: false, pickguard: false, hardware: false };
  const regions = Object.fromEntries(
    TEXTURE_PARTS.map((part) => [
      part,
      { generation: 0, texture: null, supported: false },
    ]),
  );
  let disposed = false;
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    const original = o.material,
      list = Array.isArray(original) ? original : [original],
      replacements = list.slice(),
      owned = [];
    const part =
      Object.entries(roles.body?.regions ?? {}).find(([, nodes]) =>
        nodes.includes(o.name),
      )?.[0] ?? "body";
    list.forEach((m, i) => {
      const role = Object.keys(roles).find((r) => {
        const rule = roles[r];
        return (
          !rule.exclude?.includes(o.name) &&
          (rule.nodes?.includes(o.name) ||
            rule.materials?.includes(m.name) ||
            rule.textureNodes?.includes(o.name))
        );
      });
      if (!role) return;
      const clone = m.clone();
      replacements[i] = clone;
      owned.push({
        role,
        index: i,
        material: clone,
        original: m,
        textureOnly: !!roles[role].textureNodes?.includes(o.name),
      });
      supported[role] = true;
      if (role === "body") regions[part].supported = true;
    });
    if (owned.length) {
      o.material = Array.isArray(original) ? replacements : replacements[0];
      entries.push({
        o,
        original,
        owned,
        part,
        geometry: o.geometry,
        projected: null,
      });
    }
  });
  function restorePart(part) {
    const region = regions[part];
    if (!region) throw Error("Unknown guitar part");
    region.generation++;
    for (const e of entries)
      if (e.part === part) {
        if (e.projected) {
          e.o.geometry = e.geometry;
          e.projected.dispose();
          e.projected = null;
        }
        for (const v of e.owned)
          if (v.role === "body") {
            v.material.copy(v.original);
            v.material.needsUpdate = true;
          }
      }
    region.texture?.dispose();
    region.texture = null;
  }
  function restoreBody() {
    for (const part of TEXTURE_PARTS) restorePart(part);
  }
  function set(role, color, { part } = {}) {
    if (disposed || !supported[role]) return false;
    if (!validColor(color)) throw Error("Invalid color");
    if (role === "body") {
      if (part) {
        if (!regions[part]) throw Error("Unknown guitar part");
        if (!regions[part].supported) return false;
        restorePart(part);
      } else restoreBody();
    }
    for (const e of entries)
      for (const v of e.owned)
        if (
          v.role === role &&
          (!v.textureOnly || (role === "body" && part)) &&
          (!part || e.part === part)
        ) {
          v.material.color.set(color);
          v.material.map = null;
          v.material.needsUpdate = true;
        }
    return true;
  }
  async function setTexture(id, part) {
    // Legacy callers apply one finish to all supported regions. The UI names a
    // part so simultaneous choices cannot invalidate each other.
    if (part === undefined) {
      const results = await Promise.all(
        TEXTURE_PARTS.filter((p) => regions[p].supported).map((p) =>
          setTexture(id, p),
        ),
      );
      return {
        committed: results.length > 0 && results.every((r) => r.committed),
        id,
      };
    }
    const region = regions[part];
    if (!region) throw Error("Unknown guitar part");
    if (disposed || !region.supported) return { committed: false, id, part };
    const request = ++region.generation;
    if (region.texture?.id === id) return { committed: true, id, part };
    let next;
    try {
      next = await loadTexture(id);
    } catch (error) {
      if (disposed || request !== region.generation)
        return { committed: false, id, part };
      throw error;
    }
    if (disposed || request !== region.generation) {
      next.dispose();
      return { committed: false, id, part };
    }
    const geometry = [];
    try {
      for (const e of entries)
        if (e.part === part) {
          const indices = e.owned
            .filter((v) => v.role === "body")
            .map((v) => v.index);
          if (indices.length)
            geometry.push([
              e,
              projectFinishGeometry(e.o, {
                ...next.definition,
                materialIndices: indices,
                geometry: e.geometry,
              }),
            ]);
        }
    } catch (error) {
      for (const [, g] of geometry) g.dispose();
      next.dispose();
      throw error;
    }
    for (const [e, g] of geometry) {
      e.projected?.dispose();
      e.projected = g;
      e.o.geometry = g;
      for (const v of e.owned)
        if (v.role === "body") {
          const m = v.material;
          m.copy(v.original);
          m.color.set("#ffffff");
          m.metalness = 0;
          m.roughness = next.definition.roughness;
          for (const channel of [
            "aoMap",
            "lightMap",
            "emissiveMap",
            "bumpMap",
            "displacementMap",
            "metalnessMap",
          ])
            m[channel] = null;
          Object.assign(m, next.maps);
          m.normalScale.setScalar(next.definition.normalScale);
          m.needsUpdate = true;
        }
    }
    region.texture?.dispose();
    region.texture = next;
    return { committed: true, id, part };
  }
  function reset() {
    restoreBody();
    for (const e of entries)
      for (const v of e.owned) {
        v.material.copy(v.original);
        v.material.needsUpdate = true;
      }
  }
  function color(role, { part } = {}) {
    for (const e of entries)
      for (const v of e.owned)
        if (
          v.role === role &&
          (!v.textureOnly || (role === "body" && part)) &&
          (!part || e.part === part)
        )
          return "#" + v.material.color.getHexString();
    return "#888888";
  }
  return {
    supported,
    set,
    reset,
    color,
    setTexture,
    setOriginalPart: restorePart,
    cancelPending() {
      for (const r of Object.values(regions)) r.generation++;
    },
    setOriginalBody: restoreBody,
    get textureId() {
      return regions.body.texture?.id ?? null;
    },
    get textureIds() {
      return Object.fromEntries(
        TEXTURE_PARTS.map((p) => [p, regions[p].texture?.id ?? null]),
      );
    },
    get textureSupport() {
      return Object.fromEntries(
        TEXTURE_PARTS.map((p) => [p, regions[p].supported]),
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      restoreBody();
      for (const e of entries) {
        e.o.material = e.original;
        for (const v of e.owned) v.material.dispose();
      }
      entries.length = 0;
    },
  };
}
