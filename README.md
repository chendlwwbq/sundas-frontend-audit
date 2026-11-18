# SUNDAS 前端评审

这份评审仓库包含 SUNDAS 首页、创作工作台、画布、导演台、提示词库和账户等界面的 React 源码、原始样式和配套素材。前端来自主项目提交 `e2c1dc2`。预览用本地示例数据展示交互状态。

## 打开预览

使用 Node.js 22.12+，建议使用 Node.js 24。在仓库根目录执行：

```sh
npm run setup
npm run dev
```

打开 [本地评审](http://127.0.0.1:3021/)。`npm run build` 编译到 `web/dist`，`npm run preview` 预览该构建。

根目录 [index.html](index.html) 对应已构建的静态版。运行 `python -m http.server 3021 --bind 127.0.0.1` 即可预览。

## 页面入口

评审版使用 [web/src/router.tsx](web/src/router.tsx) 的 Hash 路由，静态服务可以直接打开下列入口。

| 页面 | 路径 | 源码 |
| --- | --- | --- |
| 首页 | `/#/` | [pages/home/index.tsx](web/src/pages/home/index.tsx) |
| 发现与灵感 | `/#/explore` | [pages/home/index.tsx](web/src/pages/home/index.tsx) 中的灵感大厅 |
| 图片、视频、对话工作台 | `/#/create?mode=image`、`video`、`chat` | [pages/image](web/src/pages/image)、[pages/video](web/src/pages/video)、[pages/chat](web/src/pages/chat) |
| 画布列表与编辑器 | `/#/canvas`、`/#/canvas/:id` | [pages/canvas](web/src/pages/canvas) |
| 提示词库 | `/#/prompts` | [pages/prompts](web/src/pages/prompts) |
| 素材库与账户 | `/#/assets`、`/#/account` | [pages/assets](web/src/pages/assets)、[pages/account](web/src/pages/account) |

## 组件、类型和状态

- [components/ui](web/src/components/ui) 包含 shadcn 风格的基础组件。[components/layout](web/src/components/layout) 和 [layouts](web/src/layouts) 包含全局导航、侧栏和页面布局。
- [components/creation](web/src/components/creation)、[components/canvas](web/src/components/canvas)、[components/canvas/director](web/src/components/canvas/director) 和 [components/prompts](web/src/components/prompts) 包含业务界面及交互。
- [types](web/src/types) 和 [shared](shared) 定义媒体、节点、导演台与制作流程的数据结构。[stores](web/src/stores) 保存跨页面状态，[hooks](web/src/hooks) 和各页面目录中的 hooks 管理局部联动。
- [audit/demo.ts](web/src/audit/demo.ts) 提供预览状态与假数据，[audit/install.ts](web/src/audit/install.ts) 将界面请求接到本地示例。

## 样式与设计令牌

- [globals.css](web/src/styles/globals.css) 是 Tailwind CSS 4 的入口，包含 `@import "tailwindcss"`、`@theme inline` 和全局变量。[postcss.config.mjs](web/postcss.config.mjs) 注册 Tailwind PostCSS 插件。
- [jimeng-theme.css](web/src/styles/jimeng-theme.css) 包含 `--text-*` 文本层级以及 `--r-*` 圆角定义。全局作用域与页面专属作用域里的覆盖值可以在 [globals.css](web/src/styles/globals.css) 和 [styles](web/src/styles) 中核对。
- 当前界面固定为深色。初始深色由 [web/index.html](web/index.html) 设置，运行时状态由 [use-theme-store.ts](web/src/stores/use-theme-store.ts) 保持。
- [components.json](web/components.json) 配置 shadcn 组件和别名；[package.json](web/package.json)、[tsconfig.json](web/tsconfig.json)、[vite.config.ts](web/vite.config.ts) 分别定义依赖、类型和构建规则。
