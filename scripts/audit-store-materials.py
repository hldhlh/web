"""Read source Blender shader recipes and packed images; never alter the blend.
Run inside Blender with __file__ set to this path, or with Blender --python.
"""
import bpy, json, struct, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'output/store-model/material-audit';out.mkdir(parents=True,exist_ok=True)
b=(root/'output/store-model/source.glb').read_bytes()
n=struct.unpack_from('<I',b,12)[0];glb=json.loads(b[20:20+n])
names={m['name'] for m in glb['materials'] if 'name' in m}
images={}
def value(v):
    return list(v) if hasattr(v,'__len__') and not isinstance(v,str) else v
def expression(sock,depth=0):
    if depth>30:raise ValueError('Shader graph too deep')
    if not sock.is_linked:return {'value':value(sock.default_value)} if hasattr(sock,'default_value') else {'unsupported':sock.type}
    link=sock.links[0];node=link.from_node
    r={'type':node.type,'output':link.from_socket.name}
    if node.type=='TEX_IMAGE':
        im=node.image;r['image']=im.name;r['colorSpace']=im.colorspace_settings.name
        if im.name not in images:
            packed=im.packed_file
            filename=hashlib.sha256(im.name.encode()).hexdigest()[:12]+Path(im.filepath).suffix
            target=out/filename
            if packed:target.write_bytes(packed.data)
            else:target.write_bytes(Path(bpy.path.abspath(im.filepath)).read_bytes())
            images[im.name]=filename
        return r
    for prop in ['blend_type','use_clamp','clamp','interpolation_type','operation','uv_map','attribute_name']:
        if hasattr(node,prop):r[prop]=getattr(node,prop)
    if node.type=='VALTORGB':
        r['ramp']={'mode':node.color_ramp.color_mode,'interpolation':node.color_ramp.interpolation,'elements':[(e.position,list(e.color)) for e in node.color_ramp.elements]}
    r['inputs']=[{'name':i.name,'expression':expression(i,depth+1)} for i in node.inputs if i.enabled and (hasattr(i,'default_value') or i.is_linked)]
    return r
rows=[]
channels=['Base Color','Metallic','Roughness','Coat Weight','Coat Roughness','Sheen Weight','Sheen Tint','Sheen Roughness']
for name in sorted(names):
    m=bpy.data.materials.get(name)
    if not m or not m.use_nodes:continue
    p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if p:rows.append({'name':name,'channels':{k:expression(p.inputs[k]) for k in channels}})
snapshot=json.dumps({'materials':rows,'images':images},ensure_ascii=False,indent=2)
(out/'source-materials.json').write_text(snapshot)
(root/'scripts/store-materials/source-materials.json').write_text(snapshot)
print('Audited',len(rows),'exported materials; extracted',len(images),'source images')
