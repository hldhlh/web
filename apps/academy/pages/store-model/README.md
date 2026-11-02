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

`scripts/store-materials/source-materials.json` 保存源节点快照；`audit-report.json` 记录颜色和粗糙度审核结果。13 类图片调色在线性空间计算，10 类程序材质按几何烘焙；两种非 Principled 水/玻璃材质保留原导出结果，未进行这类节点烘焙。旧的坐垫单项脚本已被统一烘焙流程替代。构建时自动生成 SHA-256 版本清单与无损 gzip 文件，模型更新后自动刷新缓存。

## 验证和限制

浏览器真实渲染与桌面入口已检查；真实 VR 头显尚未测试。漫游不提供碰撞检测；头显使用固定点切换。网页材质使用实时 PBR 近似，颜色和粗糙度已烘焙，但实时灯光、折射及细微凹凸仍与 Blender Cycles 有差异，薄玻璃使用透明混合以减少移动端双眼折射开销。

技术文档：[Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)、[WebXRManager](https://threejs.org/docs/pages/WebXRManager)。Three.js 0.181.2 与 MeshoptDecoder 的许可证随 vendor 文件保留。

材质修复：仅对同时缺少 UV 和切线的网格关闭各向异性，保留金属度、粗糙度、颜色及贴图；保持独立材质，防止合并丢失诊断信息。固定光源阴影只生成一次，避免漫游重复计算。

坐垫颜色：导出后按 Blender「墨绿坐垫.002」中的去色、映射范围与乘色节点，在线性颜色空间烘焙墨绿皮革贴图。该处理只修改坐垫专用纹理，不调整全场景色调。

后厨地面：最后单独回填原始地砖与基层网格，保留 Float32 坐标，避免减面与低精度量化破坏亚毫米级砖缝。鸟瞰近裁剪面设为 0.5m，提升远景深度精度；店内仍为 0.05m。

炒锅、汤锅、火锅与水盆：E08 炉具以及所有锅体、锅圈、锅盖、水体和提手在全局减面前分离，优化后回填原始浮点网格与法线，保留圆形薄壁和锅沿。保护脚本需要 Node 可解析 @gltf-transform/core、extensions、functions 4.x、meshoptimizer 和 sharp。

## 云端分发与等待体验

模型随现有 GitHub Pages 部署托管，独立页面无需 Auto Office 登录即可分享。支持 WebGL 2 的手机、桌面浏览器可进入 3D，VR 需要 HTTPS 与 WebXR 设备支持，不能保证所有旧终端或所有网络均可访问。

构建自动执行 `scripts/package-store-model.mjs`，生成 `assets/model.json` 和 `shop.glb.gz`。浏览器优先下载无损 gzip（当前 23.9 MB → 16.3 MB）；解压不支持或失败时回退原始 GLB。45 秒无新数据则中止当前请求并回退/显示重试。下载完成校验 SHA-256 后写入 Cache API，按内容版本复用与淘汰；缓存拒绝、配额不足不会阻止打开。浏览器可能清理本机缓存，首次下载速度取决于用户网络。

真实字节进度与速度显示仅覆盖下载阶段；解析、材质编译分别提示，支持减少动态效果。不伪造剩余时间。独立页固定视口高度避免 canvas 与 flex 互相撑高。

参考：[Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)、[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
