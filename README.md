# 物流 ABC 分类与储位规划课堂实训

Vue 3 + Vite 学生/教师界面，Express API，Node 内置 SQLite。界面为简体中文。实现规格见 [requirement.md](requirement.md)。

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

## 实验数据

默认数据为 `server/data/default-scenario.json`，不会在运行时修改。教师修改或上传的数据写入 `$DATA_DIR/scenario.json`，每一轮保存独立快照。在线编辑后先校验参考指标，再保存；修改在下一轮生效。上传非法 JSON、不可达储位、重复 SKU、无法达到满分改善率等数据会被拒绝。损坏的覆盖文件会记录日志并回退默认数据。

## 验收

自动测试覆盖前后端算法、评分、提交幂等与冲突、教师鉴权、实验数据、CSV 和草稿存储。课堂前仍需在实际网络环境按 `requirement.md` 12.2 验收，尤其是两台电脑提交和 Excel 打开导出文件。
