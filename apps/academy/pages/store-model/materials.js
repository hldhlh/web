// glTF can contain KHR_materials_anisotropy without a usable tangent frame.
// Three.js derives one from UVs when tangents are absent. Missing both creates
// undefined lighting, seen as clipped white surfaces and black triangles.
export function repairAnisotropy(material, geometry) {
  if (!(material.anisotropy > 0) || geometry.hasAttribute('tangent') || geometry.hasAttribute('uv')) return material;
  const fixed = material.clone();
  fixed.anisotropy = 0;
  return fixed;
}
