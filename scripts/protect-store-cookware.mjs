// Run with glTF Transform 4.x, meshoptimizer and sharp installed.
// Keep thin curved cookware (wok, soup pots, hot pots and handles) outside global simplification/joining.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, mergeDocuments, prune, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const base = 'output/store-model/';
if (process.argv[2] === 'prepare') {
  const source = await io.read(base + 'materials-complete.glb');
  const protectedDoc = cloneDocument(source);
  const keep = n => /^(?:R2_)?E08实拍_|^R2_E08_|锅/.test(n.getName());
  for (const n of protectedDoc.getRoot().listNodes()) if (!keep(n)) n.dispose();
  for (const n of source.getRoot().listNodes()) if (keep(n)) n.dispose();
  await protectedDoc.transform(prune(), textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024]}));
  await source.transform(prune());
  await io.write(base+'cookware-preserved.glb',protectedDoc);
  await io.write(base+'without-cookware.glb',source);
} else if (process.argv[2] === 'restore') {
  const target = await io.read(base+'without-cookware-optimized.glb');
  const source = await io.read(base+'cookware-preserved.glb');
  const map = mergeDocuments(target,source);
  const scene = target.getRoot().getDefaultScene();
  for (const original of source.getRoot().listScenes()) {
    const merged = map.get(original);
    for (const child of merged.listChildren()) scene.addChild(child);
    merged.dispose();
  }
  await target.transform(unpartition());
  target.getRoot().setExtras({...target.getRoot().getExtras(),preservedCookware:1});
  await io.write('apps/academy/pages/store-model/assets/shop.glb',target);
} else throw new Error('Use prepare or restore');
