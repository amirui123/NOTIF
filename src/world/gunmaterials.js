/**
 * Weapon materials.
 *
 * The old viewmodel had one metal material (0x262a30, metalness 0.85) shared by
 * the receiver, the rail, the barrel, the optic housing and the magazine. That
 * is why the gun read as a single grey object: at 0.4 m from the eye, material
 * *separation* is the whole read, and there was none.
 *
 * Three things matter at this distance:
 *
 *  1. ALBEDO SEPARATION. A hard-anodised receiver, a phosphate-steel barrel, a
 *     glass-filled nylon handguard and a rubberised grip are four different
 *     colours and four different roughnesses. Aluminium anodising is a matte
 *     near-black *dielectric*, not a metal — using full metalness on it is the
 *     single biggest available mistake on a gun, because it turns the receiver
 *     into a mirror that swallows all the texture detail.
 *  2. TEXEL DENSITY. The world textures are baked for a 2.5 m tile. A weapon
 *     needs a 0.10-0.15 m tile, so the weapon materials scale the same maps far
 *     up; without that the receiver reads as smooth plastic.
 *  3. EDGE WEAR. Bare bright metal on the high-contact corners (charging handle
 *     path, magwell mouth, rail crowns). It is the cheapest possible cue that a
 *     gun has been used, and it costs one extra material.
 */
import * as THREE from 'three';

/**
 * Build the material set for one weapon. Textures come from the shared factory
 * so nothing new is generated and the gun still loads with zero network.
 *
 * @param {import('../engine/textures.js').TextureFactory} tex
 * @param {object} [opts]
 * @returns {Record<string, THREE.MeshStandardMaterial>}
 */
export function buildWeaponMaterials(tex, opts = {}) {
  const gunmetal = tex.cache.gunmetal ?? {};
  const wood = tex.cache.wood ?? {};
  const camo = tex.cache.camo ?? {};
  const aniso = tex.anisotropy ?? 4;

  /** Weapon-scale UV: the shared maps are baked for a 2.5 m tile. */
  const scaled = (map, repeat) => {
    if (!map) return null;
    const m = map.clone();
    m.wrapS = THREE.RepeatWrapping;
    m.wrapT = THREE.RepeatWrapping;
    m.repeat.set(repeat, repeat);
    m.anisotropy = aniso;
    m.needsUpdate = true;
    return m;
  };

  const mats = {};

  /**
   * Hard-anodised aluminium: receiver, rail, handguard, mount bodies.
   * Matte dielectric with a cool cast. metalness stays low on purpose.
   */
  mats.alu = new THREE.MeshStandardMaterial({
    color: 0x3a3f47,
    metalness: 0.28,
    roughness: 0.46,
    map: scaled(gunmetal.map, 6),
    normalMap: scaled(gunmetal.normalMap, 6),
    roughnessMap: scaled(gunmetal.roughnessMap, 6),
    envMapIntensity: 0.55,
  });

  /**
   * Phosphate steel: barrel, bolt carrier, muzzle device, magazine body.
   * Darker and rougher than the anodising, and genuinely metallic so the
   * barrel takes a long specular streak along its length.
   */
  mats.steel = new THREE.MeshStandardMaterial({
    color: 0x2a2d33,
    metalness: 0.82,
    roughness: 0.34,
    normalMap: scaled(gunmetal.normalMap, 9),
    envMapIntensity: 0.7,
  });

  /**
   * Glass-filled nylon: pistol grip, stock, magazine floorplate, foregrip.
   * Rough, non-metallic, slightly warmer. This is the material that stops the
   * gun reading as one solid chunk of metal.
   */
  mats.polymer = new THREE.MeshStandardMaterial({
    color: 0x23262b,
    metalness: 0.04,
    roughness: 0.82,
    normalMap: scaled(gunmetal.normalMap, 12),
    envMapIntensity: 0.35,
  });

  /** Rubberised overmould on grips and butt pads. */
  mats.rubber = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    metalness: 0.0,
    roughness: 0.94,
    normalMap: scaled(gunmetal.normalMap, 16),
    envMapIntensity: 0.25,
  });

  /** Bare aluminium where the finish has worn through. */
  mats.wear = new THREE.MeshStandardMaterial({
    color: 0x9aa2ac,
    metalness: 0.95,
    roughness: 0.22,
    envMapIntensity: 0.9,
  });

  /** Brass for cartridges and feed lips. */
  mats.brass = new THREE.MeshStandardMaterial({
    color: 0xb8892f,
    metalness: 0.92,
    roughness: 0.28,
    envMapIntensity: 0.8,
  });

  /** Oiled walnut for the bolt-action stock. */
  mats.wood = new THREE.MeshStandardMaterial({
    color: 0x5d3a22,
    metalness: 0.0,
    roughness: 0.58,
    map: scaled(wood.map, 3),
    normalMap: scaled(wood.normalMap, 3),
    envMapIntensity: 0.4,
  });

  /** Optic glass: thin, tinted, and barely reflective so the reticle reads. */
  mats.lens = new THREE.MeshStandardMaterial({
    color: 0x1d4d63,
    metalness: 0.1,
    roughness: 0.04,
    transparent: true,
    opacity: 0.34,
    envMapIntensity: 1.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /** Illuminated iron sights and fibre-optic dots. */
  mats.glow = new THREE.MeshBasicMaterial({ color: 0x5ee08a });

  /** Tritium / fibre optic in amber, for the ACOG and the reflex dot. */
  mats.glowAmber = new THREE.MeshBasicMaterial({ color: 0xff9a3c });

  if (opts.woodFurniture) {
    // The bolt-action uses wood for the stock sides as well as the butt.
    mats.polymerStock = mats.wood;
  } else {
    mats.polymerStock = mats.polymer;
  }

  // Fabric for the sleeve, plus the glove and its trim.
  mats.sleeve = new THREE.MeshStandardMaterial({
    color: opts.sleeveColor ?? 0x4a4f3d,
    metalness: 0.0,
    roughness: 0.9,
    map: scaled(camo.map, 2),
    normalMap: scaled(camo.normalMap, 2),
    envMapIntensity: 0.3,
  });
  mats.glove = new THREE.MeshStandardMaterial({
    color: opts.gloveColor ?? 0x1b1d21,
    metalness: 0.06,
    roughness: 0.74,
    normalMap: scaled(gunmetal.normalMap, 14),
    envMapIntensity: 0.32,
  });
  mats.glovePad = new THREE.MeshStandardMaterial({
    color: opts.gloveColor ?? 0x1b1d21,
    metalness: 0.02,
    roughness: 0.88,
    normalMap: scaled(gunmetal.normalMap, 18),
    envMapIntensity: 0.26,
  });
  mats.cuff = new THREE.MeshStandardMaterial({
    color: opts.cuffColor ?? 0x2f3238,
    roughness: 0.8,
    envMapIntensity: 0.3,
  });

  /** Textures cloned here belong to this viewmodel and die with it. */
  mats.dispose = () => {
    for (const value of Object.values(mats)) {
      if (!value || typeof value !== 'object' || !value.isMaterial) continue;
      for (const slot of ['map', 'normalMap', 'roughnessMap']) {
        value[slot]?.dispose();
      }
      value.dispose();
    }
  };

  return mats;
}
