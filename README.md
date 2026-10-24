# Torrent Vault

一个本地运行的 Torrent 种子管理器：手动扫描磁盘或文件夹，实时列出 `.torrent` 文件，解析种子内容，并交给本机安装的第三方 BT 客户端打开。

前端 Vue 3 + Vite，后端 Node.js + Express。所有扫描、解析和程序启动都在本机完成，种子文件不会上传到任何服务器。

## 功能

- **手动扫描盘符或文件夹**
  - 自动检测本机磁盘（盘符、卷标、剩余空间）
  - 可输入任意绝对路径，也可使用内置文件夹浏览器逐级浏览
  - 内置浏览器支持快速访问、磁盘切换、面包屑导航、直接输入路径和当前目录筛选
  - 支持递归 / 仅当前目录
  - NDJSON 流式扫描，实时显示已扫描目录数、发现数量与耗时，可随时停止
  - 扫描结果保存在浏览器本地，刷新页面后种子库不会丢失
- **解析种子内容**
  - 支持 BitTorrent v1、v2 和 v1+v2 混合种子
  - 计算 v1 info hash（SHA1）、v2 info hash（SHA256）
  - 展示内容总大小、文件清单、分片信息、创建时间、备注、Tracker、Web Seeds、Magnet 链接
  - 文件清单支持搜索、分页加载；信息哈希与 Magnet 链接可一键复制
- **第三方工具打开**
  - 自动检测 qBittorrent、BitComet、uTorrent、Transmission、Deluge、Tixati
  - 支持「系统默认应用」
  - 可添加任意自定义程序，并配置 `{file}` / `{dir}` / `{name}` / `{stem}` 启动参数
  - 可设置默认打开方式
  - 在文件资源管理器中定位种子文件
- **界面**
  - 深色桌面风格，支持搜索、来源筛选、排序、清空种子库
  - 详情侧滑面板、打开方式弹出菜单、工具管理弹窗、Toast 反馈
  - 响应式布局：窄屏下扫描设置收进侧滑抽屉，种子列表优先展示

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3（Composition API）、Vite、lucide-vue-next、原生 CSS |
| 后端 | Node.js、Express、Node 内置 `crypto` / `fs` |
| 种子解析 | 自研严格 Bencode 解码器，保留 info 原始字节范围 |
| 本地能力 | Node 文件系统 API（目录浏览）、Windows PowerShell（磁盘检测、可执行文件选择） |

## 快速开始

要求：Windows 10/11，Node.js **18.18+**（推荐 20 或 22）。

```bash
npm install
npm run build
npm start
```

打开 <http://127.0.0.1:4000>。

Windows 下也可以直接双击项目根目录的 `start.bat`，脚本会自动检查依赖、按需构建并打开浏览器。

### 开发模式

```bash
npm run dev
```

- 前端：<http://127.0.0.1:4001>
- API：<http://127.0.0.1:4000>
- Vite 会把 `/api` 请求代理到本地 API 服务

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4000` | 服务端口 |
| `HOST` | `127.0.0.1` | 监听地址，默认仅本机可访问 |
| `TV_DATA_DIR` | `<项目>/data` | 设置文件存放目录 |

## 使用说明

1. 在左侧输入文件夹路径，或直接点击磁盘卡片。也可以点「选择文件夹」打开内置文件夹浏览器，逐级浏览后选择当前文件夹。
2. 选择是否包含子文件夹，点击「扫描」。扫描结果会边扫边出现在右侧列表中；顶部进度卡会展示实时统计，可点击「停止」保留已发现结果。
3. 点击任意行的「解析」按钮，或直接点击整行打开详情：
   - 「文件」页签：查看文件路径与大小，可搜索过滤
   - 「种子信息」页签：查看 info hash、Tracker、Magnet、创建信息等
4. 点击「打开」使用默认打开方式，点击旁边的下拉箭头可选择其他程序；点击文件夹图标可在资源管理器中定位 `.torrent`。
5. 右上角「打开方式」可管理默认程序、重新检测客户端或添加自定义程序。

### 自定义程序参数

「启动参数」支持以下占位符：

| 占位符 | 含义 |
| --- | --- |
| `{file}` | 种子文件绝对路径 |
| `{dir}` | 种子文件所在文件夹 |
| `{name}` | 种子文件名（含扩展名） |
| `{stem}` | 种子文件名（不含扩展名） |

示例：

```text
--open "{file}"
```

如果参数中不包含任何占位符，程序会自动把种子文件路径追加为最后一个参数；参数留空时直接传入种子路径。

## 项目结构

```text
torrent-manager/
├─ server/
│  ├─ index.js              # Express API 与静态文件服务
│  ├─ lib/
│  │  ├─ bencode.js         # 严格 Bencode 解码
│  │  ├─ torrent.js         # v1/v2 种子元数据解析
│  │  ├─ scanner.js         # 并发流式目录扫描
│  │  ├─ drives.js          # Windows 磁盘枚举
│  │  ├─ tools.js           # 客户端检测 / 自定义工具 / 启动
│  │  ├─ filebrowser.js     # 内置文件夹浏览器的目录 API
│  │  ├─ dialogs.js         # 原生可执行文件选择
│  │  ├─ powershell.js      # PowerShell 执行封装
│  │  └─ settings.js        # data/settings.json 原子读写
│  └─ scripts/pick-file.ps1 # 自定义程序的原生文件选择
├─ web/                     # Vue 前端
│  ├─ src/App.vue
│  ├─ src/components/
│  └─ src/lib/
├─ test/                    # Node 原生单元测试
├─ data/                    # 运行时生成，已 gitignore
└─ dist/                    # 构建产物，已 gitignore
```

## API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 服务健康检查 |
| `GET` | `/api/drives?refresh=1` | 磁盘列表 |
| `POST` | `/api/scan` | 扫描，返回 NDJSON 流（start / batch / progress / done） |
| `POST` | `/api/torrent/parse` | 解析指定种子 |
| `GET` | `/api/tools` | 打开方式列表 |
| `POST` | `/api/tools/custom` | 添加自定义程序 |
| `PUT` | `/api/tools/custom/:id` | 编辑自定义程序 |
| `DELETE` | `/api/tools/custom/:id` | 删除自定义程序 |
| `POST` | `/api/tools/default` | 设置默认打开方式 |
| `POST` | `/api/open` | 调用第三方工具打开种子 |
| `POST` | `/api/reveal` | 在资源管理器中定位种子 |
| `GET` | `/api/fs/list?path=...` | 列出文件夹下的子目录（内置浏览器） |
| `GET` | `/api/fs/locations` | 获取快速访问位置 |
| `POST` | `/api/dialog/file` | 打开原生可执行文件选择器 |

## 数据与隐私

- 种子库索引保存在浏览器 `localStorage`（`torrent-vault.library.v1`）。
- 自定义打开方式保存在 `data/settings.json`，不会写入系统注册表或用户目录。
- 服务默认只监听 `127.0.0.1`，不对外网开放。
- 仅读取 `.torrent` 元数据，不下载、不修改、不移动种子文件。

## 限制与边界

- 内置文件夹浏览器不依赖系统对话框，通过本地 API 读取目录，Windows / macOS / Linux 均可使用。
- 添加自定义程序时仍会调用系统文件选择器；无桌面环境时可直接输入可执行文件绝对路径。
- 扫描默认限制：递归深度 15，最多 5000 个种子、80000 个目录；会自动跳过 `.git`、`node_modules`、`$RECYCLE.BIN`、`System Volume Information`。达到上限后保留已发现结果。
- 单个种子文件上限 64 MB；文件清单接口最多返回前 20000 个文件条目。
- 自动检测覆盖常见安装路径；便携版或非标准安装目录可通过「添加自定义程序」手动指定。
- 只负责整理、解析与打开种子，本身不提供下载/做种功能。

## 测试

```bash
npm test
```

覆盖 Bencode 解码、v1/v2 种子解析、错误输入、目录扫描、数量上限、中止扫描，以及内置文件夹浏览器的目录列表、隐藏项标记和快速访问位置。

## 备注

- 生产模式必须先执行 `npm run build`，然后 `npm start`。
- 若端口被占用，可设置 `PORT` 环境变量：`set PORT=4100 && npm start`。
