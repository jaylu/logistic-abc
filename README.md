# ABC 库存分类与仓库储位规划课堂实训

Vue 3 + Vite 学生/教师界面，Express API，Node 内置 SQLite。界面为简体中文。当前升级规范见 [update-v1.md](update-v1.md)；[requirement.md](requirement.md)保留原版设计背景，冲突处以升级规范为准。

## 本地开发

需要 Node.js ≥ 26.0.0 和 npm。所有代码均为 JavaScript。

项目使用 Node 26，仓库根目录的 `.nvmrc` 已指定版本。已安装 nvm 时先运行 `nvm install && nvm use`。

Linux 安装脚本：以应用用户（例如 `appuser`）运行 `bash scripts/install-node.sh`，不要使用 sudo。脚本安装或加载 nvm，执行 `nvm install 26`、`nvm alias default 26` 和 `nvm use 26`。可从本地上传并安装：

```bash
scp -P 18847 scripts/install-node.sh appuser@tc2:~/install-node.sh
ssh -p 18847 appuser@tc2 'bash ~/install-node.sh'
```

```bash
npm install
cp server/.env.example server/.env
# 编辑 server/.env，设置 TEACHER_PASSWORD
npm run dev
```

打开终端显示的 Vite 地址（通常是 http://localhost:5173）。学生入口 `/student`，教师入口 `/teacher`。`npm run dev` 读取 `server/.env`，开发代理自动跟随其中的 `PORT`（默认 28553），已有环境变量优先。未设置教师密码时，开发命令会提示配置步骤并退出。

如果页面提示“服务器未返回有效数据”，请检查终端中的后端启动错误，并确认看到“服务已启动”日志。修改 `.env` 后停止并重新运行 `npm run dev`。

教师登录后点“开始第一轮”，学生输入学号姓名完成实训。学生草稿只存本机浏览器，评分由服务端计算。教师可查看详情、删除提交、导出 CSV，并编辑下一轮实验数据。

```bash
npm test
npm run build
npm run test:release  # 解压到临时目录，验证启动、重复启动、健康检查、路由和停止
```

构建前端到 `server/public/`，在临时目录安装独立的后端生产依赖，生成 `dist/logistic-abc-server.tar.gz`。构建需要访问 npm 仓库。发布包顶层为 `server/`，包含纯 JavaScript 生产依赖，不含 `.env`、数据库或日志。

## 部署

自动发布到 `appuser@tc2`（SSH 端口 `18847`）：

```bash
npm run release
```

该命令先运行 `npm run build`，再用 `scp -P 18847` 上传发布包到 `~/apps/logistic/`，在远端解压到 `~/apps/logistic/server/`，为 `*.sh` 添加执行权限，依次运行 `stop.sh`、`start.sh` 和 `query.sh`。任一步失败都会停止发布并返回非零退出码。本机需要可用的 SSH/SCP 和远端登录权限。远端使用 Bash 登录环境；若找不到 Node.js，会尝试加载 nvm（`NVM_DIR`、`XDG_CONFIG_HOME/nvm` 或 `~/.nvm`）。使用 nvm 时需配置默认 Node 版本。解压和重启前会检查 Node.js ≥ 26.0.0；未安装或版本过低时保留正在运行的服务并退出。

首次发布或修改教师密码时，可以运行：

```bash
npm run release -- --password '你的教师密码'
```

注意 npm 参数前的 `--`。命令行密码可能保存在 shell 历史中；推荐通过 `RELEASE_TEACHER_PASSWORD` 环境变量传入。以下 Bash 示例隐藏输入，且不会将密码文本写入命令历史：

```bash
read -r -s -p 'Teacher password: ' RELEASE_TEACHER_PASSWORD; printf '\n'
export RELEASE_TEACHER_PASSWORD
npm run release
unset RELEASE_TEACHER_PASSWORD
```

显式 `--password` 优先于环境变量。提供密码时，会通过 SSH 标准输入传输并更新远端 `server/.env`，保留其他配置值（重新写入时不保留注释），文件权限设为 `600`。不要在密码中同时混用单引号、双引号和反引号；无法在 `.env` 中原样保存的密码会在构建前被拒绝。密码不会传入构建进程。

不提供密码时保留远端 `.env`。首次发布如未提供密码，会创建 `.env` 并停止；可用上述命令重新发布，或登录 `ssh -p 18847 appuser@tc2` 编辑 `~/apps/logistic/server/.env`。发布不会上传本地 `.env` 或数据库，远端运行数据会保留。

目标机器需要 Node.js ≥ 26.0.0；以下脚本需要 bash（Windows 可使用支持 bash 的环境，或运行 `node src/index.js`）。

```bash
tar -xzf logistic-abc-server.tar.gz
cd server
cp .env.example .env
# 编辑 .env，设置自己的 TEACHER_PASSWORD
./start.sh
./query.sh
./stop.sh
```

默认使用 HTTP，监听 `127.0.0.1:28553`。Linux 上的反向代理将 `logistic.jaylu.tech` 的请求（保留路径和查询参数）转发到 `http://127.0.0.1:28553`，可使用 `.proxyHostHeader(false)`。学生访问公网域名的 `/student`，教师访问 `/teacher`。服务同时提供前端与 API，刷新任意学生路由可用。若需局域网直连，可设置 `HOST=0.0.0.0` 并访问 `http://教师电脑局域网IP:28553/student`。

配置来自环境变量或 `server/.env`：`PORT=28553`、`HOST=127.0.0.1`、`TEACHER_PASSWORD=你的密码`、`DATA_DIR=./runtime`。未设置密码时拒绝启动。`DATA_DIR` 相对服务端目录解析，存储 `app.db`、WAL 文件、可选 `scenario.json`、`app.pid` 和 `app.log`。不要把运行目录放到 `public/`。备份数据库前停止服务，或者使用 SQLite 支持的在线备份工具。

教师会话为 HttpOnly Cookie，8 小时有效；重启服务需重新登录。同源校验额外允许 `http://logistic.jaylu.tech` 和 `https://logistic.jaylu.tech`，以支持代理重写 Host；其他外部来源仍被拒绝。HTTPS 可在本机反向代理终止，后端仍使用 HTTP；代理应设置正确的 X-Forwarded-Proto，使会话 Cookie 带 Secure 标记。时间显示为北京时间。学生无需身份验证，仅适合课堂练习。

## 学生流程与评分

任务介绍后依次完成 **① ABC分类 → ② 储位分配 → ③ 储位分配单审核 → ④ 提交及结果**。

- ABC沿用12个SKU、原周转量与双因子取较低等级算法。周转量是教学需求权重，不是库存箱数或真实逐件拣货次数。
- 仓库为2排×4列×3层×2位，共48个独立托盘货位，8位编码始终按字符串保存。地图同时展开三层，离中央走道由近到远为第1、2、3层，并提供单跨立面、外箱与库存资料。点击商品再点击空位或拖入空位；占用位不覆盖、不自动交换。
- 每SKU全部库存放入一个托盘货位，校验外箱规则排列、堆码高度和托盘载荷。托盘1200×1000×150mm，载货上限1000kg、自重20kg；三层净高1010/1040/960mm，顶部净空150mm。货架额定承重未建模，图示不用于实际工程设计。
- 成本为 `Σ 周转量 × [2 × (列号−0.5) × 列中心距/1000 + 层高惩罚]`，单位是加权等效米。层高惩罚默认0/3/6等效米。新基线41846.5，容量约束下最优改善约76.8%，保留30%满分线。默认48位中16位可用、32位由其他业务占用；12种商品占用12/16=75%的可用货位，保留4个空位。不是体积利用率。
- 确认方案后锁定布局，生成基于本人方案的12行《储位分配单》。默认恰好5个不同明细行各有1个字段错误；点击单元格标注，最多5格，也可少标。审核阶段不显示命中数。单据、日期和标注刷新后保持一致。审核页可通过底部按钮打开只读储位图弹窗，关闭后继续原位置审核，标注保持不变。
- 更改布局须先明确撤销审核，旧题与标注失效。最终提交后展示命中、误标、漏标及正确值。教师可查看底稿、错误单和标注，并导出CSV与明细JSON。

默认分值为ABC35、储位合法性15、布局效率25、单据审核20、反思5。合法性不合格直接拒绝提交；审核采用权重归一化，命中加分、误标扣分、最低0分，默认3中2误为8分。反思沿用30字满分、10～29字半分规则。所有成绩由服务器复核；前端自报分数、错误单和错误清单不参与评分。

## 实验数据与升级

默认数据在 `server/data/default-scenario.json`，`schemaVersion: 3`。默认文件是唯一部署场景源；不再保留旧字符地图作为新场景数据。纯算法位于服务端源码，前端通过ESM引用并打包，独立服务端发布包不依赖client目录。

教师修改或上传的数据写入 `$DATA_DIR/scenario.json`；每轮保存独立场景快照。在线仍可修改名称、周转量、阈值等；包装、货架、审核配置和评分权重可下载JSON修改后上传。审核错误数、标注上限和奖惩比例从配置读取，五项权重必须合计100；配置不合法或满分改善率不可达到会拒绝保存。

### 配置不可用货位

在场景JSON的 `warehouse.disabledLocations` 中配置“8位货位编码 → 不可用原因”：

```json
"disabledLocations": {
  "01101301": "其他业务占用",
  "01202102": "暂停使用"
}
```

上面仅展示字段格式，默认文件包含32条。添加条目禁用货位，删除条目重新开放；设为 `{}` 或省略整个字段表示48位全部可用。原因须为1～60字，编码必须存在。地图以灰色斜纹和原因区分不可用货位；分配校验、最优成本及评分阈值校验都会考虑此配置。

修改入口：教师端“实验数据 → 下载JSON → 修改 → 上传JSON → 校验并保存 → 开始新一轮”。也可修改随部署发布的默认文件；若已有教师自定义场景，需更新该场景或恢复默认后再开始新一轮。当前轮次快照不受改动影响。

不能禁用初始布局已占用的货位；如需禁用，须同时调整 `baselinePlacement`。可用货位不得少于商品数量，且必须保留满足容量要求和满分改善率的合法方案，否则保存会显示原因。

**升级后教师需要开始新一轮。** 旧轮次及提交记录仍保留在SQLite中；旧版自定义场景不会覆盖v3默认场景，日志会说明回退。新课堂不接收旧草稿和旧轮次提交。草稿按轮次、学号、版本隔离，换人仅清理本机活动草稿；旧草稿会提示失效。审核元数据、标注和结果复用现有JSON列，无需破坏性数据库迁移。

确定性审核用于课堂练习，不是防作弊考试机制；服务器重新生成题目并核算成绩，不增加中间提交API。修改审核错误数时同步调整 `maxMarks`，例如3错、最多3格；审核满分仍由 `scoring.documentReview` 控制。

## 验收

`npm test` 覆盖旧版兼容、48位编码、容量、成本、审核复现与评分、草稿隔离、Vue页面渲染、教师鉴权、非法提交、重试幂等、导出与课堂重置。`npm run build` 生成独立包，`npm run test:release` 验证解压启动、前端路由、健康检查和停止。

课堂前请在1366×768电脑实际检查：跨层选位与拖放、键盘单元格标注、刷新恢复同一审核单、撤销后重新规划、两台电脑独立提交，以及Excel打开CSV。屏幕级浏览器交互验收不由服务端渲染测试替代。
