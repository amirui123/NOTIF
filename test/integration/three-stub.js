/**
 * GPU-free stand-ins for the two three.js classes that need a real WebGL
 * context. Everything else (scene graph, raycaster, materials, geometries,
 * shaders) runs for real, so lifecycle bugs still surface.
 *
 * `three.module.js` exports are frozen, so the stubs are installed on a shallow
 * copy of the module namespace that the game imports through the `three` bare
 * specifier (aliased in package.json → vendor build).
 */

export function installThreeStubs(THREE) {
  class StubRenderer {
    constructor(params = {}) {
      this.domElement = params.canvas || document.createElement('canvas');
      this.shadowMap = { enabled: false, type: 0 };
      this.capabilities = { getMaxAnisotropy: () => 8, isWebGL2: true };
      this.info = { render: { calls: 0, triangles: 0 }, memory: {}, programs: [] };
      this.toneMapping = THREE.NoToneMapping;
      this.toneMappingExposure = 1;
      this.xr = { enabled: false, isPresenting: false, setAnimationLoop() {}, getSession: () => null };
      this.outputColorSpace = THREE.SRGBColorSpace;
      this._pr = 1;
      this._w = 1280;
      this._h = 800;
    }
    setPixelRatio(r) {
      this._pr = r;
    }
    getPixelRatio() {
      return this._pr;
    }
    setSize(w, h) {
      this._w = w;
      this._h = h;
    }
    getSize(t) {
      t.x = this._w;
      t.y = this._h;
      return t;
    }
    getDrawingBufferSize(t) {
      t.x = this._w * this._pr;
      t.y = this._h * this._pr;
      return t;
    }
    getClearColor(t) {
      t?.setRGB?.(0, 0, 0);
      return t;
    }
    getClearAlpha() {
      return 1;
    }
    setClearColor() {}
    setClearAlpha() {}
    setRenderTarget() {}
    getRenderTarget() {
      return null;
    }
    getActiveCubeFace() {
      return 0;
    }
    getActiveMipmapLevel() {
      return 0;
    }
    clear() {}
    compile() {}
    dispose() {}
    setAnimationLoop() {}
    setViewport() {}
    setScissor() {}
    getContext() {
      return { getExtension: () => null };
    }
    copyFramebufferToTexture() {}
    render(scene, camera) {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      globalThis.__SMOKE_FRAMES__ = (globalThis.__SMOKE_FRAMES__ || 0) + 1;
    }
  }

  class StubPMREM {
    compileEquirectangularShader() {}
    compileCubemapShader() {}
    fromScene() {
      return { texture: new THREE.Texture(), dispose() {} };
    }
    fromEquirectangular() {
      return { texture: new THREE.Texture(), dispose() {} };
    }
    fromCubemap() {
      return { texture: new THREE.Texture(), dispose() {} };
    }
    dispose() {}
  }

  try {
    THREE.WebGLRenderer = StubRenderer;
    THREE.PMREMGenerator = StubPMREM;
  } catch {
    // Frozen namespace: the test runner pre-patches the vendored module instead.
  }
  return { StubRenderer, StubPMREM };
}
