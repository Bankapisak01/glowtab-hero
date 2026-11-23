import { assetUrl } from "../app/assets.mjs";
import * as T from "three";
import {
  splitHeadstockSurface,
  splitFinishSurface,
} from "./headstock-surface.mjs";
export const MODEL_DEFINITIONS = Object.freeze({
  rgb24neot: {
    id: "rgb24neot",
    name: "LiteJam RGB24NEOT Green",
    url: assetUrl("guitars/rgb24neot/rgb24neot.glb"),
    report: assetUrl("guitars/rgb24neot/profile.json"),
    headstock: { node: "NEOT_Neck", name: "NEOT_Headstock", maxX: -5.79 },
    hiddenNodes: [],
    surfaceNames: ["NEOT_Fretboard"],
    finishRoles: {
      body: {
        materials: ["NEOT_BodyFinish"],
        textureNodes: ["NEOT_Neck", "NEOT_Headstock"],
        regions: { neck: ["NEOT_Neck"], head: ["NEOT_Headstock"] },
      },
      hardware: { materials: ["NEOT_HardwareFinish"] },
    },
  },
  rgb24neos: {
    id: "rgb24neos",
    name: "LiteJam RGB24NEOS Black",
    url: assetUrl("guitars/rgb24neos/rgb24neos.glb"),
    report: assetUrl("guitars/rgb24neos/profile.json"),
    headstock: { node: "NEOS_Neck", name: "NEOS_Headstock", maxX: -5.79 },
    hiddenNodes: [],
    surfaceNames: ["NEOS_Fretboard"],
    finishRoles: {
      body: {
        materials: ["NEOS_BodyFinish"],
        textureNodes: ["NEOS_Neck", "NEOS_Headstock"],
        regions: { neck: ["NEOS_Neck"], head: ["NEOS_Headstock"] },
      },
      hardware: { materials: ["NEOS_HardwareFinish"] },
    },
  },
  original: {
    id: "original",
    name: "Stratocaster",
    url: assetUrl("guitars/original/original.glb"),
    report: assetUrl("guitars/original/profile.json"),
    transform: [
      0,
      0,
      100,
      0,
      -50,
      -Math.sqrt(3) * 50,
      0,
      0,
      Math.sqrt(3) * 50,
      -50,
      0,
      0,
      0,
      0,
      0,
      1,
    ],
    hiddenNodes: ["pCylinder12", "group1", "wires1"],
    surfaceNames: ["guitar_holder_wood_holder_0"],
    neckBack: {
      node: "guitar_holder_wood_holder_0",
      name: "Original_NeckBack",
      axis: "z",
      offset: 0.02,
    },
    finishRoles: {
      body: {
        nodes: ["main_guitar_shape_guitar_main_0"],
        textureNodes: ["end_wire_holder_end_holder_0", "Original_NeckBack"],
        regions: {
          neck: ["Original_NeckBack"],
          head: ["end_wire_holder_end_holder_0"],
        },
      },
      hardware: {
        materials: ["metal_object"],
        exclude: ["polySurface30_metal_object_0"],
      },
    },
  },
  a1: {
    id: "a1",
    name: "LiteJam A1",
    url: assetUrl("guitars/a1/a1.glb"),
    report: assetUrl("guitars/a1/profile.json"),
    finishSplits: [
      { node: "A1_Body_body_006", axis: "x", offset: -1.2, name: "A1_Neck" },
      { node: "A1_Neck", axis: "x", offset: -5.79, name: "A1_Headstock" },
    ],
    hiddenNodes: [],
    surfaceNames: ["A1_Fretboard"],
    finishRoles: {
      body: {
        materials: ["A1_ShellFinish"],
        regions: { neck: ["A1_Neck"], head: ["A1_Headstock"] },
      },
      hardware: { materials: ["A1_HardwareFinish"] },
    },
  },
  rgb24m: {
    id: "rgb24m",
    name: "LiteJam RGB24M Nature",
    url: assetUrl("guitars/rgb24m/rgb24m.glb"),
    report: assetUrl("guitars/rgb24m/profile.json"),
    headstock: { node: "RGB24M_Neck", name: "RGB24M_Headstock", maxX: -5.79 },
    hiddenNodes: [],
    surfaceNames: ["RGB24M_Fretboard"],
    finishRoles: {
      body: {
        materials: ["RGB24M_BodyFinish"],
        textureNodes: [
          "RGB24M_Headstock",
          "RGB24M_Neck",
          "RGB24M_body006_Body",
        ],
        regions: {
          neck: ["RGB24M_Neck", "RGB24M_body006_Body"],
          head: ["RGB24M_Headstock"],
        },
      },
      hardware: { materials: ["RGB24M_HardwareFinish"] },
    },
  },
  rgb24: {
    id: "rgb24",
    name: "LiteJam RGB24",
    url: assetUrl("guitars/rgb24/rgb24.glb"),
    report: assetUrl("guitars/rgb24/profile.json"),
    hiddenNodes: [],
    surfaceNames: ["RGB24_Fretboard"],
    headstock: { node: "RGB24_Neck", name: "RGB24_Headstock", maxX: -5.79 },
    finishRoles: {
      body: {
        materials: ["RGB24_BodyFinish"],
        textureNodes: ["RGB24_Headstock", "RGB24_Neck"],
        regions: { neck: ["RGB24_Neck"], head: ["RGB24_Headstock"] },
      },
      hardware: { materials: ["RGB24_HardwareFinish"] },
    },
  },
});
export function getModelDefinition(id) {
  const d = Object.hasOwn(MODEL_DEFINITIONS, id) ? MODEL_DEFINITIONS[id] : null;
  if (!d) throw Error("Unknown guitar model");
  return d;
}
export function prepareModel(root, definition) {
  const frame = new T.Group();
  if (definition.transform)
    frame.applyMatrix4(new T.Matrix4().fromArray(definition.transform));
  frame.add(root);
  for (const name of definition.hiddenNodes) {
    const node = root.getObjectByName(name);
    if (node) node.visible = false;
  }
  frame.updateWorldMatrix(true, true);
  if (definition.headstock) {
    const h = definition.headstock;
    splitHeadstockSurface(root.getObjectByName(h.node), h);
  }
  if (definition.neckBack) {
    const n = definition.neckBack;
    splitFinishSurface(root.getObjectByName(n.node), n);
  }
  for (const split of definition.finishSplits ?? [])
    splitFinishSurface(root.getObjectByName(split.node), split);
  return frame;
}
