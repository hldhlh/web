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

原始导出位于忽略目录 `output/store-model/shop.glb`。用 glTF Transform 4.x 优化、简化，再压缩为 meshopt，输出到 `assets/shop.glb`。当前采用 1024px WebP 贴图和 meshopt；加载器与解码器本地打包，不依赖外部 CDN。

```sh
gltf-transform optimize output/store-model/shop.glb output/store-model/optimized.glb --compress meshopt --simplify-error 0.002 --simplify-ratio 0.5 --texture-compress webp --texture-size 1024
gltf-transform simplify output/store-model/optimized.glb output/store-model/lite.glb --ratio 0.35 --error 0.01
gltf-transform meshopt output/store-model/lite.glb apps/academy/pages/store-model/assets/shop.glb
npm run build
npm run check
npm test
```

## 验证和限制

浏览器真实渲染与桌面入口已检查；真实 VR 头显尚未测试。漫游不提供碰撞检测；头显使用固定点切换。网页材质使用实时 PBR 近似，程序纹理无法完整复现 Blender Cycles 效果，薄玻璃使用透明混合以减少移动端双眼折射开销。

技术文档：[Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)、[WebXRManager](https://threejs.org/docs/pages/WebXRManager)。Three.js 0.181.2 与 MeshoptDecoder 的许可证随 vendor 文件保留。
