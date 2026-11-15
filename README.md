# 物流 ABC 分类与储位规划课堂实训

Vue 3 + Vite 学生/教师界面，Express API，Node 内置 SQLite。界面为简体中文。实现规格见 [requirement.md](requirement.md)。

## 本地开发

需要 Node.js ≥ 22.13 和 npm。所有代码均为 JavaScript。

```bash
npm install
cp server/.env.example server/.env
# 编辑 server/.env，设置 TEACHER_PASSWORD
npm run dev
```

打开终端显示的 Vite 地址（通常是 http://localhost:5173）。学生入口 `/student`，教师入口 `/teacher`。开发代理默认连接后端 3000 端口；更改后端端口时同步修改 `client/vite.config.js`。

教师登录后点“开始第一轮”，学生输入学号姓名完成实训。学生草稿只存本机浏览器，评分由服务端计算。教师可查看详情、删除提交、导出 CSV，并编辑下一轮实验数据。

```bash
npm test
npm run build
npm run test:release  # 解压到临时目录，验证启动、重复启动、健康检查、路由和停止
```

构建前端到 `server/public/`，在临时目录安装独立的后端生产依赖，生成 `dist/logistic-abc-server.tar.gz`。构建需要访问 npm 仓库。发布包顶层为 `server/`，包含纯 JavaScript 生产依赖，不含 `.env`、数据库或日志。

## 部署

目标机器需要 Node.js ≥ 22.13；以下脚本需要 bash（Windows 可使用支持 bash 的环境，或运行 `node src/index.js`）。

```bash
tar -xzf logistic-abc-server.tar.gz
cd server
cp .env.example .env
# 编辑 .env，设置自己的 TEACHER_PASSWORD
./start.sh
./query.sh
./stop.sh
```

默认端口 3000，监听所有网卡。学生访问 `http://教师电脑局域网IP:3000/student`，教师访问 `/teacher`；确保防火墙允许该端口。服务同时提供前端与 API，刷新任意学生路由可用。

配置来自环境变量或 `server/.env`：`PORT=3000`、`TEACHER_PASSWORD=你的密码`、`DATA_DIR=./runtime`。未设置密码时拒绝启动。`DATA_DIR` 相对服务端目录解析，存储 `app.db`、WAL 文件、可选 `scenario.json`、`app.pid` 和 `app.log`。不要把运行目录放到 `public/`。备份数据库前停止服务，或者使用 SQLite 支持的在线备份工具。

教师会话为 HttpOnly Cookie，8 小时有效；重启服务需重新登录。经本机 HTTPS 反向代理部署时需转发正确的 Host 和 X-Forwarded-Proto。时间显示为北京时间。学生无需身份验证，仅适合课堂练习。

## 实验数据

默认数据为 `server/data/default-scenario.json`，不会在运行时修改。教师修改或上传的数据写入 `$DATA_DIR/scenario.json`，每一轮保存独立快照。在线编辑后先校验参考指标，再保存；修改在下一轮生效。上传非法 JSON、不可达储位、重复 SKU、无法达到满分改善率等数据会被拒绝。损坏的覆盖文件会记录日志并回退默认数据。

## 验收

自动测试覆盖前后端算法、评分、提交幂等与冲突、教师鉴权、实验数据、CSV 和草稿存储。课堂前仍需在实际网络环境按 `requirement.md` 12.2 验收，尤其是两台电脑提交和 Excel 打开导出文件。
