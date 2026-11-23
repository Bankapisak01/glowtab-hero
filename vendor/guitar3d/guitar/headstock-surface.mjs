import * as T from "three";

// Partition a static, single-material surface at a world-space axis plane. Both halves
// retain native attributes, so this creates a finish boundary, not a new shape.
export function splitHeadstockSurface(mesh, { maxX, name }) {
  return splitFinishSurface(mesh, { axis: "x", offset: maxX, name });
}
export function splitFinishSurface(mesh, { axis, offset, name }) {
  const source = mesh.geometry;
  if (
    Array.isArray(mesh.material) ||
    mesh.isSkinnedMesh ||
    Object.keys(source.morphAttributes).length
  )
    throw Error("Unsupported headstock surface");
  mesh.updateWorldMatrix(true, false);
  const attributes = Object.entries(source.attributes),
    sides = [[], []],
    index = source.index,
    point = new T.Vector3();
  const vertex = (i) => {
    const values = Object.fromEntries(
      attributes.map(([key, a]) => [
        key,
        Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i, c)),
      ]),
    );
    return {
      values,
      d:
        point.fromArray(values.position).applyMatrix4(mesh.matrixWorld)[axis] -
        offset,
    };
  };
  const interpolate = (a, b) => {
    const t = a.d / (a.d - b.d),
      values = {};
    for (const [key, attr] of attributes)
      values[key] = Array.from({ length: attr.itemSize }, (_, c) =>
        T.MathUtils.lerp(a.values[key][c], b.values[key][c], t),
      );
    return { values, d: 0 };
  };
  function clip(triangle, head) {
    const polygon = [],
      inside = (v) => (head ? v.d <= 0 : v.d >= 0);
    for (let i = 0; i < 3; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % 3],
        inA = inside(a),
        inB = inside(b);
      if (inA) polygon.push(a);
      if (inA !== inB) polygon.push(interpolate(a, b));
    }
    const result = [];
    for (let i = 1; i < polygon.length - 1; i++)
      result.push(polygon[0], polygon[i], polygon[i + 1]);
    return result;
  }
  for (
    let i = 0;
    i < (index?.count ?? source.attributes.position.count);
    i += 3
  ) {
    const triangle = [0, 1, 2].map((j) =>
      vertex(index ? index.getX(i + j) : i + j),
    );
    if (triangle.every((v) => v.d <= 0)) sides[0].push(...triangle);
    else if (triangle.every((v) => v.d >= 0)) sides[1].push(...triangle);
    else {
      sides[0].push(...clip(triangle, true));
      sides[1].push(...clip(triangle, false));
    }
  }
  if (sides.some((vertices) => !vertices.length))
    throw Error("Headstock boundary does not divide the neck");
  const build = (vertices) => {
    const g = new T.BufferGeometry();
    for (const [key, a] of attributes)
      g.setAttribute(
        key,
        new T.Float32BufferAttribute(
          vertices.flatMap((v) => v.values[key]),
          a.itemSize,
        ),
      );
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  };
  const head = new T.Mesh(build(sides[0]), mesh.material);
  head.name = name;
  mesh.geometry = build(sides[1]);
  mesh.add(head);
  head.updateWorldMatrix(true, false);
  // Called during initial load, before GPU upload; these calibrated necks own
  // their source geometry. Model disposal owns the two replacement geometries.
  source.dispose();
  return head;
}
