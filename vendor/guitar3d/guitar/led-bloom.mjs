import * as T from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// Compact screen-space bloom: finite 3 CSS-pixel support in each direction.
// Unlike a mip chain, it cannot develop wide tails across several fret cells.
export const BLOOM_RADIUS_CSS = 3;
const vertexShader =
  "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}";

export function withLedBloomMask(
  scene,
  emitter,
  maskMaterial,
  spill,
  black,
  render,
) {
  const saved = [];
  scene.traverse((o) => {
    if (!o.isMesh && !o.isSprite && !o.isLine && !o.isPoints) return;
    saved.push([o, o.material, o.visible]);
    if (o === spill || o.isSprite || o.isLine || o.isPoints) o.visible = false;
    else o.material = o === emitter ? maskMaterial : black;
  });
  const background = scene.background;
  scene.background = null;
  try {
    return render();
  } finally {
    scene.background = background;
    for (const [o, material, visible] of saved) {
      o.material = material;
      o.visible = visible;
    }
  }
}

export function createLedBloom({ renderer, scene, camera, leds }) {
  const target = (msaa) =>
    new T.WebGLRenderTarget(1, 1, {
      type: T.HalfFloatType,
      depthBuffer: msaa,
      samples: msaa ? Math.min(4, renderer.capabilities.maxSamples) : 0,
    });
  const base = target(true),
    source = target(true),
    horizontal = target(false),
    blurred = target(false);
  const black = new T.MeshBasicMaterial({
    color: 0,
    side: T.DoubleSide,
    toneMapped: false,
  });
  const blur = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { inputMap: { value: null }, stepUV: { value: new T.Vector2() } },
    vertexShader,
    fragmentShader: `varying vec2 vUv; uniform sampler2D inputMap; uniform vec2 stepUV;
    void main(){vec3 c=texture2D(inputMap,vUv).rgb*0.288;
      c+=(texture2D(inputMap,vUv+stepUV).rgb+texture2D(inputMap,vUv-stepUV).rgb)*0.223;
      c+=(texture2D(inputMap,vUv+stepUV*2.0).rgb+texture2D(inputMap,vUv-stepUV*2.0).rgb)*0.104;
      c+=(texture2D(inputMap,vUv+stepUV*3.0).rgb+texture2D(inputMap,vUv-stepUV*3.0).rgb)*0.029;
      gl_FragColor=vec4(c,1.0);}`,
  });
  const composite = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      baseMap: { value: base.texture },
      sourceMap: { value: source.texture },
      bloomMap: { value: blurred.texture },
    },
    vertexShader,
    fragmentShader: `varying vec2 vUv; uniform sampler2D baseMap,sourceMap,bloomMap;
    float peak(vec3 c){return max(c.r,max(c.g,c.b));}
    void main(){
      vec4 base=texture2D(baseMap,vUv);
      gl_FragColor=vec4(base.a>0.0001?base.rgb/base.a:vec3(0.0),base.a);
      #include <tonemapping_fragment>
      vec3 sharp=texture2D(sourceMap,vUv).rgb,soft=texture2D(bloomMap,vUv).rgb;
      float s=peak(sharp),b=peak(soft);
      vec3 halo=soft/max(b,0.0001)*min(0.5,b*1.8);
      gl_FragColor.rgb=1.0-(1.0-gl_FragColor.rgb)*(1.0-halo);
      // Preserve each sharp emitter's own hue after ACES, even where halos mix.
      // Only the core is recolored; neighboring fret wire detail remains visible.
      gl_FragColor.rgb=mix(gl_FragColor.rgb,sharp/max(s,0.0001),min(0.92,0.94*(1.0-exp(-s*1.25))));
      gl_FragColor.a=max(base.a,min(0.5,b*1.8));
      #include <colorspace_fragment>
      gl_FragColor.rgb*=gl_FragColor.a;
    }`,
  });
  const quad = new FullScreenQuad();
  let width = 1,
    height = 1,
    dpr = 1,
    enabled = true,
    disposed = false;
  function setSize(w, h, pixelRatio = 1) {
    dpr = Math.max(
      1,
      Math.min(2, Number.isFinite(pixelRatio) ? pixelRatio : 1),
    );
    width = Math.max(1, Math.round((Number.isFinite(w) ? w : 1) * dpr));
    height = Math.max(1, Math.round((Number.isFinite(h) ? h : 1) * dpr));
    for (const t of [base, source, horizontal, blurred])
      t.setSize(width, height);
  }
  function render() {
    const { lit, brightness } = leds.diagnostics();
    if (!enabled || !lit || !brightness) {
      renderer.render(scene, camera);
      return;
    }
    const previous = renderer.getRenderTarget(),
      clear = renderer.getClearColor(new T.Color()),
      alpha = renderer.getClearAlpha(),
      autoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      renderer.setClearColor(0, 0);
      renderer.setRenderTarget(base);
      renderer.render(scene, camera);
      withLedBloomMask(
        scene,
        leds.bloomSource.mesh,
        leds.bloomSource.material,
        leds.bloomSource.spill,
        black,
        () => {
          renderer.setRenderTarget(source);
          renderer.render(scene, camera);
        },
      );
      quad.material = blur;
      blur.uniforms.inputMap.value = source.texture;
      blur.uniforms.stepUV.value.set(((BLOOM_RADIUS_CSS / 3) * dpr) / width, 0);
      renderer.setRenderTarget(horizontal);
      quad.render(renderer);
      blur.uniforms.inputMap.value = horizontal.texture;
      blur.uniforms.stepUV.value.set(
        0,
        ((BLOOM_RADIUS_CSS / 3) * dpr) / height,
      );
      renderer.setRenderTarget(blurred);
      quad.render(renderer);
      quad.material = composite;
      renderer.setRenderTarget(previous);
      quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
      renderer.autoClear = autoClear;
    }
  }
  return {
    render,
    setSize,
    setEnabled: (value) => {
      enabled = Boolean(value);
    },
    diagnostics: () => ({
      enabled,
      radius: BLOOM_RADIUS_CSS,
      size: [width, height],
      disposed,
    }),
    dispose() {
      for (const t of [base, source, horizontal, blurred]) t.dispose();
      for (const m of [black, blur, composite]) m.dispose();
      quad.dispose();
      disposed = true;
    },
  };
}
