import { repairAnisotropy } from './materials.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

const $ = id => document.getElementById(id);
const canvas = $('scene'), status = $('status');
const views = {
  overview: { label:'整体鸟瞰', position:[15,16,11], target:[4.3,0.7,-5.8] },
  hall: { label:'前厅', position:[7.25,1.65,-0.45], target:[6.99,1.65,-1.38] },
  table: { label:'用餐区', position:[7.3,1.65,-2.6], target:[6.84,1.65,-3.32] },
  kitchen: { label:'后厨', position:[1.35,1.82,-3.1], target:[1.35,1.82,-4.08] }
};
let renderer, controls, scene, camera, rig, current='overview', loaded=false, xrSupported=false, vrIndex=0;
let yaw=0, pitch=0, pointer=null, previous=0, rotating=false, session=null;
const keys=new Set(), moveKeys=new Set();
function message(text){status.textContent=text;}
function fail(error){
  console.error(error); $('loading').hidden=false; $('load-title').textContent='模型暂时无法打开';
  $('load-message').textContent='请检查网络并重试；如果仍失败，请使用支持 WebGL 2 的浏览器。';
  $('progress').hidden=true; $('retry').hidden=false; message('加载失败，点击重新加载。');
}
$('retry').onclick=()=>location.reload();
$('help').onclick=()=>$('help-dialog').showModal();
$('close-help').onclick=()=>$('help-dialog').close();
$('fullscreen').onclick=async()=>{
  try { if(document.fullscreenElement) await document.exitFullscreen(); else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else message('此浏览器不支持网页全屏，可横屏浏览。'); }
  catch { message('无法全屏，请在浏览器中直接打开此页面。'); }
};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'退出全屏':'全屏';});
function setView(id){
  if(!loaded || session) return;
  current=id; camera.fov=id==='overview'?40:55;camera.updateProjectionMatrix(); const v=views[id]; rotating=false; $('rotate').setAttribute('aria-pressed','false');
  rig.position.set(0,0,0); camera.position.fromArray(v.position); camera.lookAt(...v.target);
  controls.target.fromArray(v.target); controls.enabled=id==='overview'; controls.autoRotate=false;
  if(controls.enabled) controls.update();
  const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'); yaw=e.y; pitch=e.x;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===id)));
  $('view-label').textContent=v.label; document.querySelector('.movement').hidden=id==='overview';
  $('rotate').disabled=id!=='overview';
  $('gesture').textContent=id==='overview'?'拖动旋转 · 双指缩放 · 右键平移':'拖动环顾 · WASD / 箭头移动';
  $('tour-caption').textContent=id==='overview'?'从整体布局，走进每一处细节。':'视线高度约 1.65 米 · 自由观察空间';
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('home').onclick=()=>setView('overview');
$('rotate').onclick=()=>{rotating=!rotating;controls.autoRotate=rotating;$('rotate').setAttribute('aria-pressed',String(rotating));};
canvas.addEventListener('pointerdown',e=>{
  if(current==='overview'||session||!loaded)return;
  canvas.focus(); pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(!pointer || pointer.id!==e.pointerId)return;
  yaw-=(e.clientX-pointer.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-pointer.y)*.004,-1.35,1.35);
  camera.rotation.set(pitch,yaw,0,'YXZ');pointer.x=e.clientX;pointer.y=e.clientY;
});
function release(){pointer=null;}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('lostpointercapture',release);
const keyMap={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
window.addEventListener('keydown',e=>{if(loaded&&current!=='overview'&&!$('help-dialog').open&&keyMap[e.code]){e.preventDefault();keys.add(keyMap[e.code]);}});
window.addEventListener('keyup',e=>keys.delete(keyMap[e.code]));
function clearMovement(){keys.clear();moveKeys.clear();pointer=null;}
window.addEventListener('blur',clearMovement);document.addEventListener('visibilitychange',clearMovement);
document.querySelectorAll('[data-move]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);moveKeys.add(b.dataset.move);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(event=>b.addEventListener(event,()=>moveKeys.delete(b.dataset.move)));
});
function placeVR(){
  const id=['hall','table','kitchen'][vrIndex],v=views[id];
  rig.position.set(v.position[0],id==='kitchen'?.17:0,v.position[2]);
}
$('vr').onclick=async()=>{
  if(session){await session.end();return;}
  if(!xrSupported){message('当前浏览器不支持沉浸式 VR。请在支持 WebXR 的头显浏览器打开本页；仍可使用 3D 漫游。');return;}
  $('vr').disabled=true;
  let requested;
  try {
    requested=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor'],optionalFeatures:['bounded-floor']});
    session=requested;clearMovement();controls.enabled=false;controls.autoRotate=false;
    vrIndex=Math.max(0,['hall','table','kitchen'].indexOf(current));placeVR();camera.position.set(0,0,0);camera.quaternion.identity();
    session.addEventListener('end',()=>{session=null;rig.position.set(0,0,0);$('vr').textContent='进入 VR';$('vr').disabled=false;setView('hall');message('已退出 VR。');},{once:true});
    await renderer.xr.setSession(session);$('vr').textContent='退出 VR';message('VR 已连接：扳机切换观察点。');
  }catch(error){if(requested)await requested.end().catch(()=>{});session=null;setView('hall');message(`未能进入 VR：${error.name==='NotAllowedError'?'授权已取消，请允许头显访问。':'请确认头显已连接，并在 HTTPS 页面重试。'}`);}
  finally{$('vr').disabled=false;}
};
async function init(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(55,1,.03,180);rig=new THREE.Group();rig.add(camera);scene.add(rig);
  const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
  const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff,0xa19b94,.55));const sun=new THREE.DirectionalLight(0xfff3e6,1.2);sun.position.set(3,14,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:40});sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.target.position.set(4,0,-6);scene.add(sun.target);scene.add(sun);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.minDistance=3;controls.maxDistance=50;controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.6;
  const updateTheme=()=>{scene.background=new THREE.Color(document.documentElement.dataset.theme==='dark'?0x292d31:0xe4e5e6);};updateTheme();
  window.addEventListener('storage',e=>{if(e.key==='app-theme'){document.documentElement.dataset.theme=e.newValue||'light';updateTheme();}});
  const resize=()=>{const r=canvas.parentElement.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(canvas.parentElement);resize();
  for(let i=0;i<2;i++){const controller=renderer.xr.getController(i);controller.addEventListener('selectstart',()=>{vrIndex=(vrIndex+1)%3;placeVR();});rig.add(controller);}
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);fail(new Error('WebGL context lost'));});
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf=await loader.loadAsync('./assets/shop.glb?v=materials-3',e=>{
    $('progress').value=e.total?e.loaded/e.total*100:0;
    $('load-message').textContent=e.total?`已下载 ${Math.round(e.loaded/e.total*100)}% · ${(e.total/1048576).toFixed(1)} MB`:`已下载 ${(e.loaded/1048576).toFixed(1)} MB`;
    if(e.total&&e.loaded===e.total){$('load-title').textContent='正在布置空间';$('load-message').textContent='模型下载完成，正在准备材质。';}
  });
  // Thin glass uses alpha blending in the preview to avoid expensive refraction
  // passes on mobile and stereo WebXR render targets.
  gltf.scene.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=true;object.receiveShadow=true;
    const repair=material=>repairAnisotropy(material,object.geometry);
    object.material=Array.isArray(object.material)?object.material.map(repair):repair(object.material);
    for(const material of (Array.isArray(object.material)?object.material:[object.material])){
      if(material.transmission>0){material.opacity=Math.max(.12,1-material.transmission);material.transmission=0;material.transparent=true;material.depthWrite=false;material.needsUpdate=true;object.castShadow=false;}
    }
  });
  scene.add(gltf.scene);renderer.shadowMap.needsUpdate=true;
  loaded=true;setView('overview');
  await renderer.compileAsync(scene,camera);
  $('loading').hidden=true;document.querySelectorAll('[data-view],#home,#rotate,#vr').forEach(b=>b.disabled=false);
  message('模型已就绪 · 选择空间开始漫游');
  if(navigator.xr&&isSecureContext){try{xrSupported=await navigator.xr.isSessionSupported('immersive-vr');}catch{}}
  $('vr').textContent=xrSupported?'进入 VR':'VR 设备说明';
  renderer.setAnimationLoop(time=>{
    const dt=Math.min((time-previous)/1000,.05);previous=time;
    if(!session&&current==='overview')controls.update();
    if(!session&&current!=='overview'&&!$('help-dialog').open){
      let x=0,z=0;const pressed=k=>keys.has(k)||moveKeys.has(k);
      if(pressed('forward'))z-=1;if(pressed('back'))z+=1;if(pressed('left'))x-=1;if(pressed('right'))x+=1;
      if(x||z){const d=new THREE.Vector3(x,0,z).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),yaw).multiplyScalar(dt*1.6);camera.position.add(d);camera.position.x=THREE.MathUtils.clamp(camera.position.x,-1,11);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-15,2);}
    }
    renderer.render(scene,camera);
  });
}
init().catch(fail);
