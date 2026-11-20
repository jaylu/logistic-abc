# update.md — ABC库存分类与仓库储位规划：多层托盘货架与储位分配单审核：完整升级规范

> 交给 AI Coding Agent / GitHub Copilot 的实施说明。以现有可运行项目为基础**增量修改**，不要重写工程，不要擅自改变当前登录、课堂重置、学生 localStorage、提交、导出、部署脚本等既有能力。先阅读项目当前代码及 `default-scenario.json` 的读取方式，再按本文件逐项实现。

## 0. 本次增量更新摘要（重点）

**学生端正式流程变为：① ABC分类 → ② 储位分配 → ③ 储位分配单审核纠错 → ④ 提交及结果。** 第③步为本次新增的必修环节，不是教师端功能，也不是自动纠正学生的布局。后端按学生**已经确定并锁定**的合法布局生成一张单据的正确底稿，再准确植入`documentReview.errorCount`个独立字段错误（默认5处）；学生通过点击对应单元格完成错误标注，标注结果计入总分。教师可查看每人的真实错误、标注和误判，并导出分项成绩。

- 新版场景文件：`default-scenario-v3.json`，实际部署时按项目约定替换`default-scenario.json`；`schemaVersion: 3`，避免复用不含审核状态的旧草稿。
- **评分调整**：ABC35分、布局合法性15分、布局效率25分、单据审核20分、反思5分，合计100分。分数权重放在场景JSON并由后端校验总和。
- 本文其他货架、托盘、SKU与部署规则沿用此前v2设计。之前的学生端若已实现第①②环节，应**最小改动**接入第③环节，保留教师重置、SQLite和部署能力。

## 1. 本次升级目标与范围

现有场景使用 `map: ["#SSSSSS", "E......", "#SSSSSS"]` 表示两排各六个平面储位，`baselinePlacement` 使用 `R1-S1` 等编码。升级后改为真正的**托盘货架储位**：

- **1个出入口** `E01`；本次只模拟一个出入货/拣货作业点，但数据模型允许未来扩展多个入口。
- **2排（row）×4列/跨（bay）×3层（level）×每层2个货位（slot）=48个独立储位**。不要把“2排4列”误实现为只有8个货位。
- 采用**8位数字货位编码**（约定见第3节）。
- 商品增加**外箱长宽高、每箱件数、单箱毛重、现存箱数**。保留原 `turnover` 值，确保ABC教学逻辑继续工作。
- 每个货位限放**一个托盘、一个SKU**；一个SKU的全部场景库存在MVP里必须装进单个托盘货位。**商品件数 != 外箱数 != 托盘数**。
- 学生放置货物时校验尺寸、高度、箱数、重量，给出可理解的错误提示；优化成绩继续依据可复算的模拟拣货指标计算。
- 学生确认储位分配后进入第③步，审核由本人储位方案生成、含5处模拟录入错误的《储位分配单》，按单元格点击标记。
- 保留课堂功能：教师重置隔离旧数据；学生按学号保存和恢复本地进度；提交后教师可查看、导出。原有数据结构发生变化时必须做好版本失效处理。

**不做**：真实WMS、立体3D、货架结构强度分析、叉车轨迹仿真、多SKU混托、拆箱散件存储、跨货位分配同一SKU、复杂补货策略和实际仓储安全认证。

## 2. 物理参数：已修正货位尺寸以匹配托盘

原货位宽1125 mm小于1200 mm托盘长度，若不允许悬挑则无法入位。**本次以货位尺寸适配托盘**：

| 参数 | 取值 | 说明 |
|---|---:|---|
| 每个货位净宽 | **1350 mm** | 托盘1200 mm沿货架正面摆放，左右合计150 mm余量 |
| 每个货位净深 | **1100 mm** | 托盘1000 mm朝货架内部，余量100 mm |
| 第1层净高 | 1010 mm | 沿用用户提供的高度 |
| 第2层净高 | 1040 mm | 同上 |
| 第3层净高 | 960 mm | 同上 |
| 作业净空 | 150 mm | 托盘/货物顶端预留的净空 |
| 托盘尺寸（长×宽×高） | 1200×1000×150 mm | 约定长沿货架正面，宽沿货架深度 |
| 托盘自重 | 20 kg | 作为总托盘重量的一部分 |
| 托盘最大载货量 | 1000 kg | 指**货物载荷**，计算 `箱数×单箱毛重`；包含托盘的总重量为该值+20 kg |
| 主通道净宽 | 3000 mm | **教学假设**，不是基于具体叉车的安全认可值 |
| 货架列中心距 | 2900 mm | **可视化及路径模拟假设**：2×1350净宽+200 mm框架/间隙，不据此推算真实货架结构 |

各层**允许的外箱堆码总高度（不含托盘）**：

- 第1层：`1010 - 150(托盘) - 150(净空) = 710 mm`。
- 第2层：`1040 - 150 - 150 = 740 mm`。
- 第3层：`960 - 150 - 150 = 660 mm`。

**非常重要**：上表层高明确作为**货位可用净高（clear height）**，不是货架离地高度或层间梁中心距。箱体计算时不得再次扣除横梁厚度。现场真正投用还需厂家确认承重、进叉高度、消防净距、货架安装公差等；本应用仅供教学模拟。

## 3. 8位数字货位编码

本项目自定义一套清晰的8位编码，并不宣称存在全国统一的8位企业编码标准。

`ZZRCCLPP`，共8个数字：

- `ZZ`：库区编号，两位，本次 `01`
- `R`：货架排号，一位，`1`~`2`
- `CC`：货架列/跨号，两位，`01`~`04`；**01靠近入口，04最远**
- `L`：层号，一位，`1`~`3`；**1层在最下方**
- `PP`：该层货位编号，两位，`01`~`02`；从入口朝仓库内部看，采用固定一致的左右顺序

示例：`01101101` = 01区 / 1排 / 01列 / 第1层 / 第01货位；`01204302` = 01区 / 2排 / 04列 / 第3层 / 第02货位。

必须实现 `encodeLocation({zone,row,bay,level,slot})`、`decodeLocation(code)`、`isValidLocation(code,scenario)`，前端显示“01区-1排-01列-1层-01位”，后端持久化原始8位字符串。**货位编号必须用字符串，不能转换为数字导致前导0丢失。**

## 4. 产品包装及库存模型

所有包装数据为**用于教学的合理模拟值，并非品牌厂商真实装箱标准**：手机、耳机、配件等具有外纸箱包装，不使用商品裸机尺寸充当货架占地。

| SKU | 产品 | 外箱尺寸 L×W×H (mm) | 件/箱 | 毛重 kg/箱 | 库存箱数 | 库存件数 |
|---|---|---|---:|---:|---:|---:|
| P01 | 笔记本电脑 | 500×350×300 | 5 | 14 | 6 | 30 |
| P02 | 智能手机 | 420×320×250 | 20 | 10 | 8 | 160 |
| P03 | 平板电脑 | 480×340×300 | 10 | 9 | 6 | 60 |
| P04 | 蓝牙耳机 | 500×400×300 | 40 | 8 | 8 | 320 |
| P05 | 智能手表 | 450×350×250 | 30 | 9 | 6 | 180 |
| P06 | 移动电源 | 450×350×300 | 30 | 18 | 6 | 180 |
| P07 | 机械键盘 | 550×450×350 | 10 | 12 | 4 | 40 |
| P08 | 无线鼠标 | 480×400×300 | 40 | 9 | 8 | 320 |
| P09 | 手机壳 | 500×400×350 | 100 | 12 | 6 | 600 |
| P10 | 数据线 | 500×400×350 | 100 | 16 | 6 | 600 |
| P11 | 屏幕贴膜 | 450×350×250 | 120 | 10 | 8 | 960 |
| P12 | 电脑包 | 600×450×400 | 12 | 10 | 4 | 48 |

保留`turnover`为既有ABC分类的**教学周转量指标**。`stockCartons`是当前库存箱数，两者互不替代：**不要用stockCartons覆盖turnover**。如果现有ABC逻辑包含“品项数累积占比”，维持此前算法和阈值约定。

## 5. 托盘容量与合法性校验（MVP确定规则）

假设所有外箱在托盘上**正向直立、同一SKU、同尺寸、规则矩形排布**，允许外箱在平面旋转90°，**不允许箱体倒置、侧放、交错码放、悬挑**。

对每SKU、每个目标层高：

```js
const countA = Math.floor(pallet.lengthMm / carton.lengthMm)
             * Math.floor(pallet.widthMm / carton.widthMm);
const countB = Math.floor(pallet.lengthMm / carton.widthMm)
             * Math.floor(pallet.widthMm / carton.lengthMm);
const cartonsPerLayer = Math.max(countA, countB);
const allowedCargoHeight = levelClearHeight - pallet.heightMm - handlingClearanceMm;
const maxLayersByHeight = Math.floor(allowedCargoHeight / carton.heightMm);
const maxCartonsByGeometry = cartonsPerLayer * maxLayersByHeight;
const maxCartonsByWeight = Math.floor(pallet.maxPayloadKg / carton.grossWeightKg);
const capacityCartons = Math.max(0, Math.min(maxCartonsByGeometry, maxCartonsByWeight));
const valid = stockCartons > 0 && stockCartons <= capacityCartons;
```

- 校验必须使用**该层对应净高**，不可统一写死。
- 托盘宽、深是托盘**平面装箱的边界**；货位宽、深只负责检查托盘能否放进去，不能让箱体超过托盘边缘。
- `grossWeightKg` 指单箱**含包装的毛重**。载货重量 = 库存箱数×单箱毛重；托盘总重量 = 载货重量 + 托盘自重。
- 不知道货架额定承重时，不能声称通过了货架结构承重校验；界面只显示“托盘载荷校验”，并提示“货架额定承重未建模”。
- `capacityCartons`表示规则排列简化算法的容量上限，不代表现实最优装箱，也不等于实际入库量。
- 容量校验失败不应静默允许放置；应显示例如：“P12电脑包：第3层最多4箱，当前5箱，请更换货位或调整库存”。
- `stockCartons`必须为非负整数；若允许0箱，表现为“无货待上架”，**不能放置**；MVP默认示例均大于0。
- `unitsPerCarton`为正整数；重量和外箱尺寸必须大于0；避免NaN、无限值、负数和越界。

当前示例的所有12种SKU，均在**第3层最严格的660mm可堆高**之下验证可放入一个托盘，故任何层都可放。高度和载荷约束仍应真实计算，不可因为示例均可放就省略。

## 6. 仓库平面图与货位可视化

### 6.1 顶视图（替换旧字符地图的模型）

- 仓库前/西侧一个 `E01` 入口；一个沿4列延伸的中央通道，两侧分别为第1排和第2排货架。
- 每排4列，每列两横向货位（`01`,`02`），合计每层16格。
- 默认只展示某一层的**2排×4列×2货位 =16个可交互平面货位**；通过“第1层 / 第2层 / 第3层”切换查看48个储位。避免将三层叠在同一个2D平面上造成视觉混乱。
- 每格标签：8位编码（可分段）、SKU或“空位”；悬浮/点击展示外箱、现存箱数、箱/层、层数、重量、容量等。
- 颜色优先表达ABC分类（A/B/C），**另用图标或边框表达不合法/超限**，不要仅靠颜色传达状态。
- 明确显示入口、通道、1至4列距离梯度；空位可拖入，占用位不允许覆盖。
- 支持“点击货物 → 点击空货位”作为拖拽的替代方式，以兼容触屏、课堂投屏演示。

### 6.2 侧视图/立面图

选择某一排某一列后，弹出/侧边展示该跨**3层×2位**的立面示意图：

- 第1层净高1010mm、允许货物710mm
- 第2层净高1040mm、允许货物740mm
- 第3层净高960mm、允许货物660mm
- 每个货位净宽1350mm、净深1100mm
- 标注托盘高度150mm和顶部作业净空150mm；展示货物实际码放的箱层数与高度

默认采用**示意比例**，不要假装是严格工程CAD施工图；提示“教学示意，不可用于货架施工和承载设计”。

## 7. 储位优化与路径模拟

原先的“离入口近的格子更适合高周转商品”应延续，但要避免简单把8位码当作距离数字。

### 基线布局

`baselinePlacement`由SKU→8位货位编码组成，每个SKU恰好一个合法空位，不能出现重复编码或不可用货位。系统加载前验证，不合规则显示场景错误而不是继续算分。

### 指标定义（教学模拟，不是叉车真实运行时间）

- 将入口`E01`定义在第1列前方、中央通道西端。
- 每列的中心取货距离：`(bay - 0.5) × bayPitchMm / 1000` 米。两排中心通道对称，取货位置位于同一中央通道中心线；左右不同货位`PP`在MVP中不加偏移。
- 单次取放的**水平往返距离**：`2 × 该列中心距离`；本版本忽略在同一条多SKU订单中合并路径等复杂算法。
- 为表现高层货位不便于高频拣货，另列出**层高处理惩罚**：第1层`0`、第2层`3`、第3层`6`，单位为“**等效米**”，不是声称真实叉车多走了几米；此惩罚系数允许以后调整。
- 商品的模拟作业成本 = `turnover × (水平往返距离 + 层高等效距离)`。
- 仓库总模拟作业成本 = 所有商品作业成本之和；数值显示为**加权等效距离**，不要写成真实行走公里或叉车工时。
- 改善率 = `(baselineCost - currentCost) / baselineCost`，其中基线必须>0；改善率可为负数（优化变差）。
- 如果旧评分按`fullScoreImprovement=0.30`进行归一化，**保留字段和评分接口语义**，但先核算新基线与可达到的理论改善是否足以达到30%；如果达不到，必须调低合理阈值并在代码注释说明，而不是让满分无法达到。
- 前端提供“优化前/后”比较；如果保留动画，展示简化的沿通道取放路径，并以“模拟路线”标识。

**注意业务概念**：`turnover`是需求权重，用于比较货位布局；这并不意味着对整箱托盘进行逐件真实拣货，也不应宣称该模型是企业真实WMS的最佳路径算法。

## 8. 页面与交互修改清单

### 学生端

1. **任务简介**：展示2排×4列×3层×2位=48储位、托盘参数、外箱与库存参数，保持原有入口/开始任务流程。
2. **ABC分类**：保留12 SKU及原周转量；表格增加“现存箱数、每箱件数、外箱尺寸”，可放在详情弹层，避免表格过宽。ABC逻辑不变。
3. **储位规划**：替换旧12格平面图为48格层级选择器；新增“货位编码、层选择、立面图、容量提示、拖拽/点击分配”。
4. **非法操作提示**：重复占位、跨层容量不符、位置编码不存在、商品无库存等情况阻止提交；提示具体SKU/货位/超限原因。
5. **新增第三阶段：储位分配单审核纠错**：见第14～21节完整规范。储位方案锁定后生成含5个错误字段的12行分配单；学生仅标注错误单元格，评分由后端重算。
6. **分析与评分**：展示库存箱数、托盘占用率（12/48=25%）、各层储位利用率、模拟作业成本以及改善率。注意**储位利用率25%不是体积利用率**。
7. **学生提交**：提交 `scenarioVersion/sessionId/studentId/name/placements/abcAnswers/reflection` 等业务数据（字段命名对接现有代码），评分在后端按当前场景重算。允许原流程中的刷新恢复、已提交提示、重试幂等。

### 教师端

1. 课堂任务页展示货架参数、SKU数、储位数、各层高度、评分规则摘要。
2. 继续支持固定密码教师登录、**重置课堂并产生新sessionId**、清除本轮提交视图、导出CSV。
3. 结果页增加`documentReviewCorrectMarks/documentReviewWrongMarks/documentReviewScore`及错误清单，继续展示`baselineCost/currentCost/improvementRate/placementValid/occupiedSlots/slotCapacityErrors`列；建议另提供CSV中的位置编码清单或单独导出明细JSON，避免一个CSV单元格包含过长结构。
4. CSV导出需有UTF-8 BOM供中文Excel使用，并做公式注入转义，防止姓名/自由文本以 `=`, `+`, `-`, `@` 开头时被Excel执行为公式。
5. 不要因为教师“重置课堂”而删除以前的数据文件/记录的物理备份：**MVP优先使用sessionId区分课堂轮次，教师端默认只显示当前轮次**；若现有产品明确定义重置为删除旧数据，修改前要保持旧实现的用户可见语义或提供导出提示。

## 9. 本地状态、后端和迁移策略

- `schemaVersion`现升级到**3**（v1→v2为货架升级，v2→v3为审核新增）。不要让旧`R1-S1`编码自动解释成新8位编码，也不要将旧v2草稿冒充已完成审核；旧存档不得直接参与新场景评分。
- 新场景发布、教师重置和学生切换学号，都必须使用合适的状态隔离键，例如`logistic-abc:${sessionId}:${studentId}:${schemaVersion}`；切换学号时清理前一个学号的活动草稿（按现有约定），不要误删其他课堂的服务器提交。
- 页面加载时核对服务端`sessionId`、`schemaVersion`以及可选的`scenarioRevision`。若不匹配则清空/归档旧草稿并展示“课堂或场景已更新，请重新开始”，**不得静默提交旧布局**。
- 老师配置/静态场景应从服务器统一提供，客户端不要另存一份易漂移的“官方场景”。
- 后端提交时重新校验**货位总量48、位置编码合法性、无重复占位、商品存在、每SKU恰好一格、装箱容量、分数**；客户端校验仅用于体验。
- 后端必须以服务端当前`sessionId`/场景为准，拒绝旧课堂提交，并保持原有提交幂等处理。
- 继续使用现有Node.js/SQLite（或已有轻量持久化方案），不要为48格引入ORM、微服务或额外数据库。
- 密码可沿用现有硬编码方案用于本地受控课堂，但应使用服务器端会话/签名token，不要把教师密码暴露在`client`打包内容；公开互联网部署需增加安全防护，不将此教学方案视为生产级认证。

## 10. 建议的数据结构与模块改动

```text
client/src/
  components/WarehouseTopView.vue       # 两排四列、分层切换
  components/RackElevation.vue          # 单跨3层×2位立面
  components/ProductCartonInfo.vue      # 外箱/箱数详情
  components/LocationPicker.vue         # 8位编码选位
  ...                                   # 保留原组件与路由，按需拆分
server/
  public/                                # 根目录构建产物
  ...
shared/ (可选，若当前工程不适合共享则不要强制新增)
  warehouse.js                          # 纯函数：编码、容量、成本
```

不要为每一条规则新建文件；优先提炼3组**可测试纯函数**：

1. `location.js`：`encodeLocation`, `decodeLocation`, `allLocations`, `isValidLocation`
2. `pallet.js`：`getPalletCapacity`, `validatePlacement`
3. `simulation.js`：`getPlacementCost`, `getImprovementRate`, `getStorageMetrics`

如果现有仓库算法位于其他目录，沿用现有风格，**不要为了符合上述示意目录而重构无关代码**。业务公式前后端必须保持一致；可以用共享ESM模块或同一测试向量保障一致。

保留现有根目录`npm run build`：先构建Vue前端到`server/public/`，再打包独立`server`为`tar.gz`。确保服务端启动时能找到`default-scenario.json`（随包拷贝、明确相对路径），SQLite数据库路径可写、不会被静态资源覆盖。保留`start.sh`、`stop.sh`、`query.sh`既有命令形式；服务端独立运行**不应依赖client目录、项目根目录或开发时shared目录**。

## 11. `default-scenario.json` 升级后完整示例（v3）

下面JSON是**可落地的数据规范**。请根据现有加载器的路径替换原文件；不得保留旧`map`和旧`R1-S1`布局作为并存的第二套真值。货架“二维地图”应从`warehouse.layout`参数生成。

```json
{
  "schemaVersion": 3,
  "name": "电商数码商品仓（托盘货架版）",
  "description": "12种数码商品；完成ABC分类、48个托盘货位储位规划，再审核由本人储位方案生成的储位分配单（随机5处错误）并标注。周转量及包装库存为教学模拟数据。",
  "thresholds": {
    "turnover": {
      "a": 0.8,
      "b": 0.95
    },
    "itemCount": {
      "a": 0.2,
      "b": 0.5
    }
  },
  "abcCheckLimit": 3,
  "fullScoreImprovement": 0.3,
  "warehouse": {
    "zoneCode": "01",
    "entry": {
      "id": "E01",
      "side": "west",
      "aisle": "central"
    },
    "layout": {
      "rows": 2,
      "baysPerRow": 4,
      "levelsPerBay": 3,
      "slotsPerLevel": 2,
      "bayPitchMm": 2900,
      "mainAisleWidthMm": 3000
    },
    "slot": {
      "clearWidthMm": 1350,
      "clearDepthMm": 1100,
      "levelClearHeightsMm": [
        1010,
        1040,
        960
      ],
      "handlingClearanceMm": 150
    },
    "pallet": {
      "lengthMm": 1200,
      "widthMm": 1000,
      "heightMm": 150,
      "tareWeightKg": 20,
      "maxPayloadKg": 1000
    },
    "locationCode": {
      "format": "ZZRCCLPP",
      "zoneDigits": 2,
      "rowDigits": 1,
      "bayDigits": 2,
      "levelDigits": 1,
      "slotDigits": 2
    }
  },
  "products": [
    {
      "sku": "P01",
      "name": "笔记本电脑",
      "turnover": 30,
      "carton": {
        "lengthMm": 500,
        "widthMm": 350,
        "heightMm": 300,
        "unitsPerCarton": 5,
        "grossWeightKg": 14
      },
      "stockCartons": 6
    },
    {
      "sku": "P02",
      "name": "智能手机",
      "turnover": 120,
      "carton": {
        "lengthMm": 420,
        "widthMm": 320,
        "heightMm": 250,
        "unitsPerCarton": 20,
        "grossWeightKg": 10
      },
      "stockCartons": 8
    },
    {
      "sku": "P03",
      "name": "平板电脑",
      "turnover": 25,
      "carton": {
        "lengthMm": 480,
        "widthMm": 340,
        "heightMm": 300,
        "unitsPerCarton": 10,
        "grossWeightKg": 9
      },
      "stockCartons": 6
    },
    {
      "sku": "P04",
      "name": "蓝牙耳机",
      "turnover": 240,
      "carton": {
        "lengthMm": 500,
        "widthMm": 400,
        "heightMm": 300,
        "unitsPerCarton": 40,
        "grossWeightKg": 8
      },
      "stockCartons": 8
    },
    {
      "sku": "P05",
      "name": "智能手表",
      "turnover": 35,
      "carton": {
        "lengthMm": 450,
        "widthMm": 350,
        "heightMm": 250,
        "unitsPerCarton": 30,
        "grossWeightKg": 9
      },
      "stockCartons": 6
    },
    {
      "sku": "P06",
      "name": "移动电源",
      "turnover": 200,
      "carton": {
        "lengthMm": 450,
        "widthMm": 350,
        "heightMm": 300,
        "unitsPerCarton": 30,
        "grossWeightKg": 18
      },
      "stockCartons": 6
    },
    {
      "sku": "P07",
      "name": "机械键盘",
      "turnover": 45,
      "carton": {
        "lengthMm": 550,
        "widthMm": 450,
        "heightMm": 350,
        "unitsPerCarton": 10,
        "grossWeightKg": 12
      },
      "stockCartons": 4
    },
    {
      "sku": "P08",
      "name": "无线鼠标",
      "turnover": 170,
      "carton": {
        "lengthMm": 480,
        "widthMm": 400,
        "heightMm": 300,
        "unitsPerCarton": 40,
        "grossWeightKg": 9
      },
      "stockCartons": 8
    },
    {
      "sku": "P09",
      "name": "手机壳",
      "turnover": 420,
      "carton": {
        "lengthMm": 500,
        "widthMm": 400,
        "heightMm": 350,
        "unitsPerCarton": 100,
        "grossWeightKg": 12
      },
      "stockCartons": 6
    },
    {
      "sku": "P10",
      "name": "数据线",
      "turnover": 360,
      "carton": {
        "lengthMm": 500,
        "widthMm": 400,
        "heightMm": 350,
        "unitsPerCarton": 100,
        "grossWeightKg": 16
      },
      "stockCartons": 6
    },
    {
      "sku": "P11",
      "name": "屏幕贴膜",
      "turnover": 300,
      "carton": {
        "lengthMm": 450,
        "widthMm": 350,
        "heightMm": 250,
        "unitsPerCarton": 120,
        "grossWeightKg": 10
      },
      "stockCartons": 8
    },
    {
      "sku": "P12",
      "name": "电脑包",
      "turnover": 40,
      "carton": {
        "lengthMm": 600,
        "widthMm": 450,
        "heightMm": 400,
        "unitsPerCarton": 12,
        "grossWeightKg": 10
      },
      "stockCartons": 4
    }
  ],
  "baselinePlacement": {
    "P01": "01101101",
    "P02": "01203201",
    "P03": "01201101",
    "P04": "01204201",
    "P05": "01102101",
    "P06": "01104101",
    "P07": "01201201",
    "P08": "01103101",
    "P09": "01204302",
    "P10": "01104301",
    "P11": "01203301",
    "P12": "01101201"
  },
  "documentReview": {
    "enabled": true,
    "errorCount": 5,
    "maxMarks": 5,
    "allowedErrorFields": [
      "locationCode",
      "productName",
      "sku",
      "specification",
      "expectedCartons",
      "actualCartons",
      "unit"
    ],
    "oneErrorPerRow": true,
    "randomization": "deterministic-seeded",
    "grading": {
      "pointsPerCorrectMark": 4,
      "penaltyPerWrongMark": 2
    }
  },
  "scoring": {
    "abc": 35,
    "placementValidity": 15,
    "placementEfficiency": 25,
    "documentReview": 20,
    "reflection": 5
  }
}
```

## 12. 必须具备的自动化测试与验收

- [ ] 生成48个**唯一**8位数字货位编码；`01101101`、`01204302`解析回正确排/列/层/位。
- [ ] 每层可堆货高度分别为710/740/660mm；与托盘1200×1000及净宽1350×净深1100相容。
- [ ] 示例12个SKU库存均可单货位容纳：运行容量算法得到合法结果；改变P12为5箱并放第3层应出现超限提示。
- [ ] 任何两个SKU占同一货位、非法8位编码、无库存商品上架，前端阻止且后端拒绝。
- [ ] 编码保留前导0，前后端/CSV一致；48格选择器可逐层切换且立面信息正确。
- [ ] ABC分类仍基于原有12条`turnover`数据，结果与版本1相同。
- [ ] 基线与学生布局评分相同纯函数计算；移动高周转SKU到近入口/低层时成本下降（在其他条件不变且有可用货位的情况下）。
- [ ] `fullScoreImprovement`对应真实可达到的区间；没有必然拿不到的满分阈值。
- [ ] 刷新恢复草稿；换学号清理活动草稿；教师重置后旧session草稿与旧提交不能混入新课堂。
- [ ] 提交一次/重复提交结果一致，教师导出正确，后端拒绝篡改分数与非法布局。
- [ ] `npm run build`生成独立tar.gz，解压到另一目录可运行start/stop/query脚本并正确读取场景。

## 13. 推荐实施顺序（Copilot按批次提交）

1. **模型与测试优先**：读取现有代码，增加schema v2解析、8位编码、容量公式、迁移校验、测试向量。
2. **场景升级**：替换默认JSON（第11节），更新后端场景接口与提交校验。
3. **仓库UI**：2D三层切换+单跨立面+放置交互+错误提示。
4. **成本评价**：基线/当前模拟成本、改善率、教师导出、评分阈值校准。
5. **端到端回归**：登录、课堂重置、localStorage恢复、提交幂等、独立部署与脚本。

**实现原则**：代码简洁、类型/命名清晰、避免重复数据源、不引入与需求无关的依赖；遇到现有代码与文档冲突，优先保持产品已有能力并只对新货架模型做必要变更，在PR说明中列出兼容处理。


## 14. 第三阶段的真实业务语境与原始表单

用户提供的《储位分配单》模板包含：**作业单号、入库单号、仓库编号、仓管员、日期**；明细字段为**序号、库区、储位、货品名称、货品编号、规格、应放数量、实放数量、单位、备注**；末尾有**制单人、作业人**。模板只有8行示例空白明细，不是必须固定8行。此课堂有12种SKU，**渲染12行**，必要时滚动/分页，不丢数据。字段名称遵循模板，不要改成不符合业务语境的“检查题目”等。

教学情境：仓库管理员（学生）已完成库存分类和储位规划；系统模拟另一名制单员把储位规划抄录到《储位分配单》，可能发生录入错误。学生作为审核员，对照**自己已确认的储位规划**及商品资料找出单据错误。**审核题目的标准答案是学生的已确认方案，不是系统基线方案或优化参考答案**。布局是否合理已由第二阶段独立评分。

单据字段映射（以每个SKU一行，顺序稳定，按P01～P12或当前统一的商品顺序）：

| 单据列 | 正确值来源 | 可植入错误 | 说明 |
|---|---|---|---|
| 序号 | 稳定行序1～12 | 否 | 行号不是独立错误题 |
| 库区 | 已确定储位码的前两位，例如`01` | 暂不 | MVP不与储位码重叠制造双重错误 |
| 储位 | `placements[sku]` 的8位码 | 是：`locationCode` | 仅替换单元格显示值，仍保留原值作答案 |
| 货品名称 | `products[sku].name` | 是：`productName` | 改为**另一真实SKU的名称** |
| 货品编号 | `products[sku].sku` | 是：`sku` | 改为**另一真实SKU编号** |
| 规格 | `L×W×H mm/箱` | 是：`specification` | 从该SKU真实包装参数派生 |
| 应放数量 | `stockCartons` | 是：`expectedCartons` | 正整数、不得与原值相同 |
| 实放数量 | `stockCartons` | 是：`actualCartons` | 课堂假设“规划全部入位且成功实放”；不建真实收货流程 |
| 单位 | `箱` | 是：`unit` | 可改为`件`；不改数字、错误只计一个单元格 |
| 备注 | 默认`按规划上架`或空值 | 否 | 保持统一 |

表头：作业单号可由`sessionId`与studentId生成可显示标识；入库单号使用可追溯的模拟编号；仓库编号使用场景库区`01`；仓管员显示学生姓名；日期使用本地课堂日期并在生成后固定；制单人为“模拟制单员”，作业人为学生。**表头不纳入5处错误**，避免审核答案模糊。上面字段映射是基于用户模板提出的数字化设计规则，而非原模板中已提供的实际数值。

## 15. 页面、交互及状态机（新增第③步）

导航：`任务介绍 → ABC分类 → 储位规划 → 储位分配单审核 → 总结提交`。新增第③步的主界面建议：

```text
┌────────────────────── 储位分配单审核（第3步/共4步） ──────────────────────┐
│ 审核提示：本单据存在5处录入错误。对照已确认的储位规划和商品资料，点击错误单元格。│
│ [查看我的储位方案] [查看商品规格]                  已标注 2/5  [清除标注] │
├───────────────────────────────────────────────────────────────────────┤
│ 作业单号 ...     入库单号 ...      仓库编号 01     仓管员 ...   日期 ...  │
│ 序号 库区 储位       货品名称  货品编号 规格       应放数量 实放数量 单位 备注 │
│  1   01  01101101   ...       P01     ...          6       6      箱  ...│
│  2   01  01203201   ...       P02     ...          8       8      箱  ...│
│ ...                                                                ...│
│ 制单人：模拟制单员                   作业人：...                         │
├───────────────────────────────────────────────────────────────────────┤
│ [上一步]                                    [完成审核，进入提交]           │
└───────────────────────────────────────────────────────────────────────┘
```

- 先校验第二步12个SKU均有**有效、互不冲突且容量允许**的储位；未通过不能进入审核。
- 点击“确认储位方案并生成分配单”时记录只读`placementSnapshot`（完整SKU→8位码）、`productSnapshot`（版本或场景快照标识）与`reviewId`，并锁定用于审核的布局。审核过程中不可静默改变上一阶段布局。
- 学生点击**单个可审核单元格**切换“标注有误/取消标注”，标注外观为醒目的边框、角标与`已标注`文字，支持键盘和触屏，不要只靠红色。
- 已标注数量最多为`maxMarks`，默认5；可以少于5提交，允许取消后重选；学生**无需在单元格直接编辑改正值**，第三步仅做错误定位。
- `查看我的储位方案`与`查看商品规格`提供只读参考（弹层/并列面板）。不要直接高亮答案或提示某个字段错了。
- 审核期间不显示“已正确标注几处”；点击只存标注，**最终提交后**展示正确命中数、漏标数、误标数以及真实错误与正确值。也可选择教师端才显示详细标准答案，但默认提交完成后可查看。
- 若允许返回第二步，必须通过“返回并重新规划”明确提醒：**更改布局会使当前审核单与标注失效**。实际布局变动时生成新`reviewId`及题目；未变动可以继续当前题目。为简化实现，推荐审核阶段禁用直接编辑布局，提供显式撤销审核并返回的操作。
- 页面刷新后恢复相同错误的同一张单据和标注，不重新随机，复原后的原始行值、行序、单号均不变。

## 16. 随机错误生成：恰好5处、可复现、无歧义

`default-scenario.json`新增：

```json
"documentReview": {
  "enabled": true,
  "errorCount": 5,
  "maxMarks": 5,
  "allowedErrorFields": ["locationCode", "productName", "sku", "specification", "expectedCartons", "actualCartons", "unit"],
  "oneErrorPerRow": true,
  "randomization": "deterministic-seeded",
  "grading": { "pointsPerCorrectMark": 4, "penaltyPerWrongMark": 2 }
}
```

**随机化规则：**

1. 先从已锁定布局与官方商品数据构造**无误的12行标准单据**；标准表不得由前端提交的“错误表”反推。
2. 错误数从场景的`documentReview.errorCount`获取，绝不在代码写死`5`。校验`errorCount`为整数、`0 <= errorCount <= SKU行数 × 可错字段数`；由于默认`oneErrorPerRow=true`，这里进一步要求`errorCount <= 12`；若开启审核，建议`errorCount>=1`。`maxMarks`默认为`errorCount`且至少为其值；默认都是5。
3. 按稳定随机种子，选出`errorCount`个**不同的明细行**；每行从`allowedErrorFields`选择一个字段，合计恰好5个错误单元格，行列组合唯一。尽量让字段类型有变化；但不承诺每种类型都出现。**不要把同一行关联的两列同时改成一个新商品**，否则“错误数”失去明确含义。
4. 每个错误通过`mutateCell(correctValue, field, row, scenario, rng)`生成，必须保证**显示值不同于标准值**、字段格式合理且只有指定单元格被更改。例如：数量加减1～3（不得小于1）、SKU换成其他现有编号、名称换成其他现有名称、规格换成其他现有箱规、单位从箱改为件、储位改为一个**有效的其他8位货位**。对于储位，不要求错误值满足整张单的唯一性——重复储位本身可以是需发现的问题——但不能出现超出编码规则的乱码。
5. 对于规格字段，只使用真实官方产品的`外箱尺寸`，不随意伪造0mm等明显格式错误。变更后的整单仍保留标准底稿与错误元数据用于评分。
6. 错误配置与内容必须对该学生**稳定可复现**，不同学生可以不同。推荐以`sessionId + studentId + scenarioRevision + placementFingerprint + reviewAttemptId`生成种子（使用固定跨前后端一致的纯JS哈希+PRNG，如FNV-1a + mulberry32）；`reviewAttemptId`首次进入时生成并保存。**不是安全加密或防作弊手段**，目标是同张单复现，后端用同一算法重建。
7. 只保存稳定的`reviewAttemptId`、`placementFingerprint`、`reviewId`和用户`marks`即可复算；也可以为调试在localStorage缓存`generatedRows`，但最终评分永远以**服务端重建**结果为准。**前端生成的单据、种子、错误位置或自报的正确答案都不可信**。
8. 教师重置课堂生成新`sessionId`、换学号、场景版本升级，均需开启新审核题。若配置无法生成足量真实差异，场景启动/生成阶段给出明确错误，**不得少出题或卡死**。

**评分答案坐标：** 用`rowId = sku`表示**该行原始身份**，用`fieldKey`表示要标注的字段，例：`{ "rowId": "P02", "fieldKey": "locationCode" }`。即使`sku`列被故意改错，`rowId`仍是隐藏稳定身份，且**不展示为答案提示**。不能仅靠表格的可见SKU反推行身份；也不能允许标注整行来代替单元格。

**可替代实现的边界：** 若已有安全/私有随机种子机制可以沿用；但不要为此加入新的后端数据库写入步骤或第三方API。教学用确定性随机方案足够。若将来要求真正防作弊，再改为服务器提前生成审核题并只返回无答案的公开部分。

## 17. 评分方案：审核结果计入总分

新版**100分**建议权重配置如下（场景JSON的`scoring`）：

| 维度 | 分值 | 计算方法 |
|---|---:|---|
| ABC分类 | **35** | 分类正确比例×35，沿用已有ABC正确性逻辑 |
| 储位合法性 | **15** | 12SKU全部分配到合法唯一且容量足够的位置得15；否则提交422，与原规则一致 |
| 储位优化效果 | **25** | 改善率≤0得0；达到`fullScoreImprovement`得25；中间线性插值。若实际已有校准阈值，继续沿用 |
| 储位分配单审核 | **20** | `clamp(4×正确标记数 - 2×错误标记数, 0, 20)`；按JSON里的每标记得分/误标扣分计算，上限为本维度20 |
| 反思说明 | **5** | 沿用现有反思文字长度规则，原10分等比例调整为5/2.5/0 |
| **总分** | **100** | 服务端按原始数据统一复核 |

`正确标记数=marks ∩ errorCells`；`错误标记数=marks - errorCells`；`漏标数=errorCells - marks`。重复标记不计两次。错标扣分但整项不为负；漏标本身得0，不另扣分。支持标注0～5处；标得越多不代表分越高。

评分严格从服务端当前场景读取`scoring`、`documentReview.grading`与`errorCount`；启动时校验`scoring`总和=100，并验证`errorCount×pointsPerCorrectMark`与审核满分相符（默认`5×4=20`）。若教师未来修改`errorCount`为其他值，应**同步配置每项分值**或按`documentReview`满分权重进行归一化：推荐通用公式 `max(0, min(reviewWeight, reviewWeight × (correctMarks - penaltyPerWrongMark/pointsPerCorrectMark × wrongMarks) / errorCount))`，取1位小数。此公式在`errorCount=5`时与上述默认规则等价，**因此不需要同步修改每个错误分值**；实现优先采用此通用公式，`pointsPerCorrectMark`及`penaltyPerWrongMark`表示相对奖惩比。

不得由前端直接上传一个`reviewScore=20`后照单全收。后端重建错误集合后计算三项计数和得分，并写入SQLite，与原分数一起归档。

## 18. 数据模型与API更新（保持最后才提交）

**前端localStorage示意：**

```json
{
  "schemaVersion": 3,
  "sessionId": "当前课堂ID",
  "studentId": "学号",
  "studentName": "姓名",
  "abcAnswers": {},
  "placements": { "P01": "01101101" },
  "reflection": "……",
  "step": "document-review",
  "review": {
    "reviewId": "稳定审核题ID",
    "reviewAttemptId": "本次审核随机尝试ID",
    "placementFingerprint": "已锁定储位映射的规范化指纹",
    "placementSnapshot": { "P01": "01101101" },
    "marks": [{ "rowId": "P02", "fieldKey": "locationCode" }]
  }
}
```

以上只列一条`P01`用于表达结构，真实快照应为12个SKU。指纹须以**SKU排序后完整的12条映射**序列化，避免JS对象插入顺序造成错题；`reviewAttemptId`首次生成后不可每次刷新重建。`reviewId`可由相关字段确定性派生；不要把隐藏错误清单存入持久草稿用于业务判断。

**提交接口**：继续沿用`POST /api/submissions`，新增`review`对象；不增加中间步骤提交API。服务器流程：

1. 按既有流程校验studentId/sessionId/schemaVersion/提交幂等；加载服务器权威scenario。
2. 校验ABC、储位布局及12个SKU数据；将当前`placements`重算为标准分配单。
3. 校验`review.placementSnapshot`（如果上传）与当前`placements`完全一致，`placementFingerprint`一致；不一致返回422，要求学生回第二步重做审核。
4. 基于当前`sessionId/studentId/scenarioRevision/placementFingerprint/reviewAttemptId`**重新生成相同的5个错误单元格**；不信任前端的`generatedRows`或`errorCells`。
5. 校验`marks`只包含允许的`rowId`/`fieldKey`，无重复、数量≤`maxMarks`，计算TP/FP/FN和审核得分。
6. 重新计算ABC/布局/反思全部分数，保存`scoreBreakdown`、错误题快照或可复现元数据、用户标注、统计及审计时间戳；返回总分与各维得分。

**教师端**：学生列表加“审核得分/正确标记/错误标记/漏标”列；详情增加原单、错误单（可高亮标准答案）、学生标注与正确值对比。CSV导出增加`documentReviewScore,documentReviewCorrectMarks,documentReviewWrongMarks,documentReviewMissedMarks,documentReviewErrorCount`；建议明细JSON导出`errorCells+marks+correctValues`方便查错。沿用UTF-8 BOM及CSV注入防护。

**SQLite**：尽量复用已有`submissions`表的JSON文本列与评分列。如果当前字段固定，做一次**小型、幂等的ALTER TABLE迁移**，例如`review_json TEXT`、`review_score REAL`、`review_correct INTEGER`、`review_wrong INTEGER`、`review_missed INTEGER`。已有历史提交没有审核字段应显示“历史版本/未参加”，**不可误判为0分**；不要求引入ORM或复杂任务表。

## 19. 学生端与教师端的体验细节

- 学生完成①②后才解锁③，完成③后才可最终提交；摘要页明确显示“ABC分类 / 储位规划 / 单据审核 / 反思”。
- 审核页是**对错误位置的定位**，不是让学生改对原单数据。按“点击标注”完成，不再额外要求学生输入文字纠正值。
- “已标注5/5”只表示已选5格，**不代表标注正确**；可在最终提交前取消标注。
- 当`errorCount`修改为3、7等时，标题/引导语、可标注上限、服务端评分、教师导出及验收断言都从配置动态获取。
- 点击重置全部标注需要二次确认；不要改变ABC答案或储位映射。
- 如学生尚未打开审核单就返回修改储位，则重新依据新布局生成；如已打开并修改储位，**必须使旧题和标注失效**。
- 正式任务不允许学生从浏览器绕过第三步直接伪造“已完成”，后端检查审核对象完整性，但不把教学模式当成防作弊考试系统。

## 20. 测试与验收（新增第三步）

- [ ] 使用附件《储位分配单》的表头字段和明细列，按当前12个SKU动态显示12条，不强制8行；单号、仓管员等正确填写。
- [ ] 学生流程严格是①ABC → ②储位分配 → ③储位分配单审核 → ④最终提交，③之前不能提交。
- [ ] 审核表严格基于**学生已确认**的SKU→储位映射，不是baselinePlacement或参考最佳布局。
- [ ] 默认`documentReview.errorCount=5`，每张表**恰好5个错误单元格、分布在5个不同行**；其余所有单元格与标准底稿相同。
- [ ] 错误字段取自配置白名单；错误内容在规范值域内且与正确值不同，标注按`rowId + fieldKey`唯一识别。
- [ ] 点击可标记/取消，标注上限5；标错和漏标允许提交但按规则扣分。
- [ ] 刷新/断网后本地恢复**同一张错单**；同一输入+seed前后端生成严格相同错误；换学号/新课堂/场景升级后不会串题。
- [ ] 更改储位后旧审核题失效；没有布局或布局非法不能生成审核单。
- [ ] 全中5处：审核20分；全误标5处：审核0分；3中2误：审核8分；2中0误：审核8分；空标：审核0分；总分不超100。
- [ ] 更改`errorCount`为3，显示3错、最多标3格，服务器重算审核分可达20；不得写死`5`。
- [ ] 任意伪造前端审核分数/错误清单/错误表不影响服务器重算，非法字段/重复标注请求返回422。
- [ ] 教师端可以查看每个学生单据及标注/标准答案，导出新增成绩列；旧版历史提交标记为“未参加审核”。
- [ ] 既有课堂重置、提交幂等、SQLite存储、`npm run build`、tar.gz、start/stop/query不回归。

## 21. Copilot实施顺序（本次新增内容优先）

1. 阅读现有Vue页面、路由、场景加载、评分与教师结果导出，**复用现有设计**。
2. 将场景JSON更新为v3，添加`documentReview`与`scoring`，调整学号/轮次localStorage版本隔离。
3. 实现三个纯函数：`buildAllocationDocument(placements, scenario, studentContext)`、`generateReviewErrors(document, config, seed)`、`scoreReview(marks, errorCells, config)`；以相同的纯模块在Node端重算或使用共享测试向量校验一致性。
4. 新增`DocumentReview.vue`与可复用`AllocationDocumentTable.vue`；参考表单字段准确实现12行，单元格点击/取消与标注统计。
5. 增加审核题锁定、刷新恢复、修改布局失效和最终提交整合；修改服务端验证、SQLite记录、教师明细和CSV。
6. 加单测、课堂端到端回归和独立压缩包部署测试；更新README说明第三步。

**约束**：这是对已经实现的系统**增量开发**，不得重写已有ABC或货架算法；禁止增加AI服务、复杂数据库、多角色权限、第三方表格编辑器。按现有工程代码风格落地，避免为了分层而制造大量空文件。
