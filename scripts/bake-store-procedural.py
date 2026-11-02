"""Blender background: bake remaining procedural color/roughness on actual geometry.
Reads the raw GLB and original .blend materials. Does not save the source .blend.
Writes only new UV streams, textures, and per-primitive material copies to raw GLB.
"""
import bpy,json,struct,io,os,re
from pathlib import Path
from mathutils import Vector,kdtree
import numpy as np
root=Path(__file__).resolve().parents[1];out=root/'output/store-model/material-audit';out.mkdir(parents=True,exist_ok=True)
path=root/'output/store-model/materials-baked.glb';data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+size]);binary=bytearray(data[28+size:])
report=json.loads((out/'report.json').read_text());todo={r['name'] for r in report if r['status']=='review'}
widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4};dtypes={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1',5122:'<i2',5120:'i1'}
def read_accessor(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];count=a['count'];width=widths[a['type']];dtype=np.dtype(dtypes[a['componentType']]);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    arr=np.ndarray((count,width),dtype=dtype,buffer=binary,offset=offset,strides=(v.get('byteStride',dtype.itemsize*width),dtype.itemsize)).copy()
    if a.get('normalized'):
        limits=np.iinfo(dtype);arr=np.maximum(arr.astype(np.float32)/limits.max,-1)
    return arr

def append_view(blob,target=None):
    binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(blob)
    view={'buffer':0,'byteOffset':offset,'byteLength':len(blob)}
    if target:view['target']=target
    doc['bufferViews'].append(view);return len(doc['bufferViews'])-1

def append_attribute(array,typ):
    arr=np.asarray(array,dtype='<f4');v=append_view(arr.tobytes(),34962)
    a={'bufferView':v,'componentType':5126,'count':len(arr),'type':typ}
    if typ=='VEC3':a.update({'min':arr.min(axis=0).tolist(),'max':arr.max(axis=0).tolist()})
    doc['accessors'].append(a);return len(doc['accessors'])-1

def append_texture(blob,name):
    v=append_view(blob);doc['images'].append({'name':name,'mimeType':'image/png','bufferView':v});doc['textures'].append({'source':len(doc['images'])-1,'sampler':0});return len(doc['textures'])-1

# The cabbage mesh is evaluated Geometry Nodes output, not a stored mesh ID.
attribute_sources={}
bpy.context.window.scene=bpy.data.scenes['餐厅模型_干净渲染']
for instance in bpy.context.evaluated_depsgraph_get().object_instances:
    ob=instance.object
    if ob.type!='MESH' or ob.data.name in attribute_sources or 'leaf_mask' not in ob.data.attributes:continue
    tree=kdtree.KDTree(len(ob.data.vertices))
    for vertex in ob.data.vertices:tree.insert(vertex.co,vertex.index)
    tree.balance();mask=[v.value for v in ob.data.attributes['leaf_mask'].data]
    attribute_sources[ob.data.name]=(tree,mask)
scene=bpy.data.scenes.new('Web material baking');bpy.context.window.scene=scene
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.bake.margin=3
baked=[]
for mi,mesh_info in enumerate(doc['meshes']):
 for pi,primitive in enumerate(mesh_info['primitives']):
    srcmat=doc['materials'][primitive.get('material',0)];name=srcmat.get('name')
    if name not in todo:continue
    original=bpy.data.materials.get(name)
    if not original:raise RuntimeError('Missing source material '+name)
    p=next(n for n in original.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    channels=[c for c in ['Base Color','Roughness'] if p.inputs[c].is_linked]
    attrs={key:read_accessor(a) for key,a in primitive['attributes'].items()}
    pos=attrs['POSITION'];indices=read_accessor(primitive['indices']).reshape(-1).astype(int) if 'indices' in primitive else np.arange(len(pos))
    verts=np.stack([pos[:,0],-pos[:,2],pos[:,1]],axis=1)
    mesh=bpy.data.meshes.new('Bake_'+str(mi)+'_'+str(pi));mesh.from_pydata(verts.tolist(),[],indices.reshape(-1,3).tolist());mesh.update()
    obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj)
    for old in bpy.context.selected_objects:old.select_set(False)
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    # Attribute-driven cabbage color: transfer the source's leaf mask by nearest
    # original vertex after decimation, in the source object's local coordinates.
    attribute_nodes=[n for n in original.node_tree.nodes if n.type=='ATTRIBUTE']
    for node in attribute_nodes:
        source_name=re.sub(r'\.\d+$','',mesh_info['name'])
        if source_name not in attribute_sources or node.attribute_name!='leaf_mask':
            raise RuntimeError('Missing source attribute '+mesh_info['name']+' '+node.attribute_name)
        tree,mask=attribute_sources[source_name]
        new=mesh.attributes.new(node.attribute_name,'FLOAT','POINT')
        for v in mesh.vertices:new.data[v.index].value=mask[tree.find(v.co)[1]]
    mesh.uv_layers.new(name='WebBakeUV');mesh.uv_layers.active_index=0
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
    uv=np.array([mesh.uv_layers.active.data[i].uv[:] for i in range(len(mesh.loops))],dtype=np.float32)
    loop_indices=np.array([l.vertex_index for l in mesh.loops],dtype=int)
    # from_pydata receives triangles, so loop order equals the new draw order.
    newattrs={key:append_attribute(a[loop_indices],doc['accessors'][primitive['attributes'][key]]['type']) for key,a in attrs.items()}
    newattrs['TEXCOORD_0']=append_attribute(uv,'VEC2')
    mat=json.loads(json.dumps(srcmat));mat['name']=name+'__baked_'+str(mi)+'_'+str(pi)
    for channel in channels:
        copy=original.copy();mesh.materials.clear();mesh.materials.append(copy)
        nodes=copy.node_tree.nodes;links=copy.node_tree.links
        principled=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
        emit=nodes.new('ShaderNodeEmission');emit.inputs['Strength'].default_value=1
        socket=principled.inputs[channel]
        if socket.is_linked:links.new(socket.links[0].from_socket,emit.inputs['Color'])
        else:emit.inputs['Color'].default_value=socket.default_value
        links.new(emit.outputs[0],output.inputs['Surface'])
        image=bpy.data.images.new('BakeTarget',width=512,height=512,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='Base Color' else 'Non-Color'
        image_node=nodes.new('ShaderNodeTexImage');image_node.image=image;nodes.active=image_node
        print('BAKE',name,mesh_info['name'],channel,flush=True)
        bpy.ops.object.bake(type='EMIT')
        filename=out/(str(mi)+'_'+str(pi)+'_'+('color' if channel=='Base Color' else 'rough')+'.png')
        image.filepath_raw=str(filename);image.file_format='PNG';image.save()
        if channel=='Roughness':
            # glTF uses G for roughness and B for metallic. Emit baking stores a
            # grayscale image, so replace R/B using Blender's pixel buffer.
            pixels=np.empty(512*512*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(-1,4)
            pixels[:,0]=1;pixels[:,2]=float(p.inputs['Metallic'].default_value);pixels[:,3]=1;image.pixels.foreach_set(pixels.reshape(-1));image.save()
        texture=append_texture(filename.read_bytes(),mat['name']+'_'+channel)
        pbr=mat.setdefault('pbrMetallicRoughness',{})
        if channel=='Base Color':pbr['baseColorTexture']={'index':texture};pbr['baseColorFactor']=[1,1,1,1]
        else:pbr['metallicRoughnessTexture']={'index':texture};pbr['roughnessFactor']=1;pbr['metallicFactor']=1
        bpy.data.images.remove(image);bpy.data.materials.remove(copy)
    mat.setdefault('extras',{})['proceduralColorBake']=1;doc['materials'].append(mat)
    primitive['material']=len(doc['materials'])-1;primitive['attributes']=newattrs;primitive.pop('indices',None)
    bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(mesh)
    baked.append({'source':name,'mesh':mesh_info['name'],'channels':channels})
doc['buffers'][0]['byteLength']=len(binary);js=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*(-len(js)%4);binary.extend(b'\0'*(-len(binary)%4))
target=root/'output/store-model/materials-complete.glb';target.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
(out/'procedural-report.json').write_text(json.dumps(baked,ensure_ascii=False,indent=2));print('COMPLETE',len(baked),'procedural primitives',flush=True)

for row in report:
    matches=[b for b in baked if b['source']==row['name']]
    if matches:
        row.update(status='procedural-baked', unbaked=[], bakedMeshes=[b['mesh'] for b in matches])
(root/'scripts/store-materials/audit-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
