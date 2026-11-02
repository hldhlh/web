import bpy, json, os
from mathutils import Vector
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'../output/store-model'))
os.makedirs(out,exist_ok=True)
s=bpy.data.scenes['餐厅模型_干净渲染']; bpy.context.window.scene=s
cams=[]
for o in s.objects:
 if o.type=='CAMERA':
  p=o.matrix_world.translation; d=o.matrix_world.to_quaternion() @ Vector((0,0,-1))
  cams.append({'name':o.name,'position':[p.x,p.z,-p.y],'target':[p.x+d.x,p.z+d.z,-p.y-d.y]})
dg=bpy.context.evaluated_depsgraph_get()
items=[]; cache={}
for inst in dg.object_instances:
 o=inst.object
 if o.type not in {'MESH','CURVE','FONT','SURFACE'} or o.hide_render: continue
 if inst.is_instance and inst.parent and inst.parent.hide_render: continue
 key=o.original.as_pointer()
 if key not in cache:
  try: cache[key]=bpy.data.meshes.new_from_object(o,preserve_all_data_layers=True,depsgraph=dg)
  except Exception: continue
 items.append((o.name,cache[key],inst.matrix_world.copy()))
print('EXPORT_ITEMS',len(items),'MESHES',len(cache),flush=True)
export=bpy.data.scenes.new('Web export'); bpy.context.window.scene=export
for name,mesh,matrix in items:
 obj=bpy.data.objects.new(name,mesh); export.collection.objects.link(obj); obj.matrix_world=matrix
 if len(mesh.polygons)>6000 and not name.startswith('建筑｜后厨全域红色防滑砖'):
  mod=obj.modifiers.new('Web preview reduction','DECIMATE'); mod.ratio=6000/len(mesh.polygons)
# Limit image dimensions for phones. Source blend is never saved.
for img in bpy.data.images:
 if img.size[0]>1024 or img.size[1]>1024:
  scale=1024/max(img.size); img.scale(max(1,int(img.size[0]*scale)),max(1,int(img.size[1]*scale)))
bpy.ops.export_scene.gltf(filepath=out+'/source.glb',export_format='GLB',use_active_scene=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='AUTO')
with open(out+'/cameras.json','w') as f: json.dump(cams,f,ensure_ascii=False)
print('EXPORTED',os.path.getsize(out+'/source.glb'),flush=True)
