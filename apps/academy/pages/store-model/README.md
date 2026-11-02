# 门店模型预览

Auto Office 首页「快捷访问」→「门店模型预览」。路由：`#/apps/store-model`。

使用真实的 `今岭缦云_发布模型.blend` 中的「餐厅模型_干净渲染」场景。
保留米制坐标，转换 Blender Z-up 到 glTF Y-up。导出时展开集合实例，生成浏览器专用副本；不保存或修改源 blend。

- 整体旋转、缩放、平移、自动环绕、复位。
- 前厅 / 用餐区 / 后厨固定视点，拖动环顾，WASD 与触屏方向按钮移动。
- HTTPS 下支持 WebXR immersive-vr 的头显可进入 VR，扳机轮换三个观察点。
- 不支持 VR 时保留 3D 模式并解释设备要求；无 WebGL 或下载失败时提供重试。
- 沿用快捷权限；已打开的模型不因 Auto Office 实时刷新重复下载。

## 模型更新

从仓库根目录运行（Blender 路径按本机调整）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b '/path/to/今岭缦云_发布模型.blend' -t 4 --python scripts/export-store-model.py
```

原始导出位于忽略目录 `output/store-model/source.glb`。先烘焙源材质节点，再压缩，避免丢失调色后不同木材被错误合并。Python 图片处理需要 numpy、Pillow；优化使用 glTF Transform 4.x。

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b '/path/to/今岭缦云_发布模型.blend' --python scripts/audit-store-materials.py
python3 scripts/bake-store-materials.py
/Applications/Blender.app/Contents/MacOS/Blender -b '/path/to/今岭缦云_发布模型.blend' -t 4 --python scripts/bake-store-procedural.py
node scripts/protect-store-cookware.mjs prepare
gltf-transform optimize output/store-model/without-cookware.glb output/store-model/without-cookware-optimized.glb --palette false --compress meshopt --simplify-error 0.01 --simplify-ratio 0.2 --texture-compress webp --texture-size 1024
node scripts/protect-store-cookware.mjs restore
/Applications/Blender.app/Contents/MacOS/Blender -b '/path/to/今岭缦云_发布模型.blend' --python scripts/export-store-floor.py
python3 scripts/fix-store-floor.py
npm run build
npm run check
npm test
```

`scripts/store-materials/source-materials.json` 保存源节点快照；`audit-report.json` 记录颜色和粗糙度审核结果。13 类图片调色在线性空间计算，10 类程序材质按几何烘焙；两种非 Principled 水/玻璃材质保留原导出结果，未进行这类节点烘焙。旧的坐垫单项脚本已被统一烘焙流程替代。更新模型后同步递增 `app.js` 的模型缓存版本。

## 验证和限制

浏览器真实渲染与桌面入口已检查；真实 VR 头显尚未测试。漫游不提供碰撞检测；头显使用固定点切换。网页材质使用实时 PBR 近似，颜色和粗糙度已烘焙，但实时灯光、折射及细微凹凸仍与 Blender Cycles 有差异，薄玻璃使用透明混合以减少移动端双眼折射开销。

技术文档：[Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)、[WebXRManager](https://threejs.org/docs/pages/WebXRManager)。Three.js 0.181.2 与 MeshoptDecoder 的许可证随 vendor 文件保留。

材质修复：仅对同时缺少 UV 和切线的网格关闭各向异性，保留金属度、粗糙度、颜色及贴图；保持独立材质，防止合并丢失诊断信息。固定光源阴影只生成一次，避免漫游重复计算。

坐垫颜色：导出后按 Blender「墨绿坐垫.002」中的去色、映射范围与乘色节点，在线性颜色空间烘焙墨绿皮革贴图。该处理只修改坐垫专用纹理，不调整全场景色调。

后厨地面：最后单独回填原始地砖与基层网格，保留 Float32 坐标，避免减面与低精度量化破坏亚毫米级砖缝。鸟瞰近裁剪面设为 0.5m，提升远景深度精度；店内仍为 0.05m。

炒锅、汤锅、火锅与水盆：E08 炉具以及所有锅体、锅圈、锅盖、水体和提手在全局减面前分离，优化后回填原始浮点网格与法线，保留圆形薄壁和锅沿。保护脚本需要 Node 可解析 @gltf-transform/core、extensions、functions 4.x、meshoptimizer 和 sharp。
