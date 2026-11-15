# Weapon renders

Previews of the rebuilt viewmodels, produced by a CPU rasteriser (the build
environment has no GPU). Each triangle is shaded with a two-light Lambert plus
specular term and fogged by depth, so what these show is silhouette, chamfer
highlight bands and material separation — the three things the rebuild was for.

They are not ray-traced, and the real renderer adds procedural normal/roughness
maps on top, so the shipped game looks richer than this.

Regenerate with the same approach used to make them: `buildViewmodel(id, ...)`
from `src/world/viewmodel.js`, then rasterise `root` at ~1.5x its bounding box.
