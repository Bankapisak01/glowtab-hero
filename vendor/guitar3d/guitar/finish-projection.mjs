import * as T from "three";

// Independent UVs for generic finish images, measured in the normalized model
// frame. Preserve native UVs for non-body groups and never mutate the source.
export function projectFinishGeometry(
  mesh,
  { tileSize, rotation = 0, materialIndices = [0], geometry = mesh.geometry },
) {
  if (!(tileSize > 0) || !Number.isFinite(tileSize))
    throw Error("Invalid texture scale");
  mesh.updateWorldMatrix(true, false);
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(),
    pos = g.getAttribute("position");
  const uv =
    g.getAttribute("uv")?.clone() ??
    new T.Float32BufferAttribute(new Float32Array(pos.count * 2), 2);
  const groups = g.groups.length
      ? g.groups
      : [{ start: 0, count: pos.count, materialIndex: 0 }],
    allowed = new Set(materialIndices);
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    ab = new T.Vector3(),
    ac = new T.Vector3(),
    n = new T.Vector3(),
    p = new T.Vector3();
  const cs = Math.cos(rotation),
    sn = Math.sin(rotation);
  for (const group of groups) {
    if (!allowed.has(group.materialIndex)) continue;
    for (
      let i = group.start;
      i < Math.min(pos.count, group.start + group.count);
      i += 3
    ) {
      a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(mesh.matrixWorld);
      n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const x = Math.abs(n.x),
        y = Math.abs(n.y),
        z = Math.abs(n.z),
        axis = z >= x && z >= y ? "front" : y >= x ? "side" : "end";
      for (let j = i; j < i + 3; j++) {
        p.fromBufferAttribute(pos, j).applyMatrix4(mesh.matrixWorld);
        const u = (axis === "end" ? p.y : p.x) / tileSize,
          v = (axis === "front" ? p.y : p.z) / tileSize;
        uv.setXY(j, cs * u - sn * v, sn * u + cs * v);
      }
    }
  }
  g.setAttribute("uv", uv);
  g.deleteAttribute("tangent");
  return g;
}
