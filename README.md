# Tracker

这是一个面向任意目标人物的完整访谈追踪项目。输入人物后，流程先检查已经登记的可信来源，再进行全网补充检索；合格候选经过自动筛选和事件去重后进入访谈清单，补充内容摘要与核验状态，最后生成可阅读的 Markdown 报告。

王宁 MVP 已经跑通“人物与来源配置 → 定向检索 → 全网补充 → 自动筛选与去重 → 内容整理 → 报告生成”的完整链路。黄仁勋目前只完成一场官方来源试跑，尚未执行同等范围的全量检索。

## MVP 工作流程

1. 在 `people.json` 登记目标人物和检索别名；
2. 在 `channels.json` 按人物维护可信一手来源；
3. 优先逐一检查可信来源，再执行全网补充检索；
4. 把每次检索范围和结果写进 `search-log.json`，避免下次从头重复；
5. 候选通过 `import-interview.js` 自动判断是否合格、是否重复，以及应保留文字、视频还是音频；
6. 最终事件进入 `interviews.json`，同一场访谈始终只有一条记录和一个最佳来源；
7. 为访谈补充概括、关键内容定位和核验状态；
8. 用 `generate-report.js` 按发布日期倒序生成最终报告。

`channels.json` 是日常最主要的人工维护入口，但不是唯一入口：新增人物时需要同时更新 `people.json`；检索账本、去重日志、访谈清单和报告应由执行流程持续写入或生成，不应全部靠人工直接编辑。

## 这一阶段解决什么问题

每一行数据只代表一场真实发生的访谈。我们不保存转载、不为同一场访谈建立多个媒体资产，也暂时不做网页和数据库。

一场访谈只保留一个最佳来源，优先顺序是：

1. 原始发布方提供的完整文字底稿；
2. 原始发布方提供的完整视频；
3. 原始发布方提供的完整音频。

以后找到更优来源时，直接替换原记录中的 `source`，不新增一条记录。

## 什么可以收录

- 目标人物参加的一对一专访；
- 目标人物参加的多人对谈或圆桌；
- 以谈话为主体的完整视频、音频或逐字底稿；
- 来源由采访方、节目制作方、活动主办方或目标人物官方发布。

## 什么不收录

- 新闻转载、二手整理和第三方复述；
- 精华片段、短视频切片、预告和摘要；
- 只有零散引语的报道；
- 演讲、广告、纯纪录片旁白；
- 新闻发布会、业绩会、股东会；
- 只有公司其他高管发言、目标人物没有参加的内容。

以上内容可以在检索过程中充当线索，但不进入最终访谈清单。

## 每场访谈保存什么

数据保存在 `data/interviews.json`。字段刻意控制得很少：

| 字段 | 含义 |
| --- | --- |
| `id` | 这场访谈的唯一编号；同一场访谈永远沿用同一个编号 |
| `person_id` | 目标人物编号，对应 `people.json` |
| `title` | 访谈标题 |
| `program` | 节目、播客或栏目名称 |
| `interview_type` | `one_on_one` 或 `group_conversation` |
| `other_participants` | 除目标人物外的主持人、采访者或其他主要参与者 |
| `published_date` | 首次公开发布日期 |
| `event_date` | 实际录制或发生日期；不知道时填 `null` |
| `source` | 唯一保留的完整一手来源 |
| `topics` | 主要话题，方便以后生成报告 |
| `content_summary` | 根据完整一手来源整理的整场概括；必须明确是项目方转述，不冒充人物原话 |
| `key_points` | 关键观点及其在原始内容中的定位，方便返回原文、视频或音频复核 |
| `content_review` | 本次内容整理使用的证据、核验日期和完成状态 |

`source` 只允许是完整底稿、完整视频或完整音频，并必须标明原始发布者。

内容整理字段采用渐进补充：尚未整理的访谈可以暂时没有这三个字段；一旦开始整理，`content_summary`、`key_points` 和 `content_review` 必须同时存在。`content_summary` 和 `key_points.summary` 一律是项目方概括，不保存成伪造引语。`key_points.locator` 使用原文小标题和问题主题，或视频、音频时间点，让读者能够回到一手来源复核。`content_review.verification_status` 为 `verified` 时表示已检查完整来源，为 `partial` 时表示证据核验尚未完成，正式报告必须显式提示。

## 运行方式

在 Windows PowerShell 中使用 `npm.cmd`，其他终端通常可直接使用 `npm`。

```powershell
# 检查全部数据及关联关系
npm.cmd run validate

# 生成可勾选的 Markdown 搜索清单并保存到文件
npm.cmd run search-plan -- wang-ning --from 2026-08-14 --to 2026-12-31 --output reports/wang-ning-search-plan.md

# 需要机器读取时仍可输出 JSON
npm.cmd run search-plan -- wang-ning --format json

# 在制作完整候选 JSON 前，手工登记一个重要排除结果
npm.cmd run review -- --person wang-ning --url <链接> --title <标题> --reason incomplete

# 导入一条候选访谈并自动筛选、去重
npm.cmd run import -- <候选访谈.json>

# 对中等相似候选人工确认后，明确作为新访谈或合并到已有访谈
npm.cmd run import -- <候选访谈.json> --force-new
npm.cmd run import -- <候选访谈.json> --merge-with <已有访谈id>
npm.cmd run import -- <候选访谈.json> --reconsider

# 生成指定人物的报告
npm.cmd run report -- wang-ning

# 运行自动测试
npm.cmd test
```

确认数据通过校验后，运行 `npm run report -- <person_id>` 生成该人物的 Markdown 报告。例如 `npm run report -- wang-ning` 会生成 `reports/wang-ning.md`。报告只读取最终访谈清单，按发布日期倒序排列，并展示唯一一手来源、内容概括、关键内容定位和核验状态；检索线索、转载和去重过程不会进入正文。

当前王宁 MVP 清单只代表检索账本中 `2025-01-01` 至 `2026-08-13` 的公开可检索范围，不代表更早历史内容或受限平台内部内容已经全部覆盖。

## 人物、来源和检索账本

- `data/people.json` 是人物表：保存人物的标准姓名和检索别名。以后增加人物只需在这里新增一条。
- `data/channels.json` 是按人物分组的一手来源地图：同一个人的来源连续放在一起，记录采访媒体、节目制作方、活动主办方或人物官方渠道，以及每个渠道怎么查。新增来源时只追加到对应人物组末尾，不自动重排。
- `data/search-log.json` 是检索账本：每次检索写明人物、检索方式、查询词和时间范围，并记录查了什么、处理了多少结果、下次从哪里继续。
- `data/reviewed-candidates.json` 是重要排除候选的轻量记录：只保存真正进入判断、但因不完整、非一手或属于排除类型而未收录的结果，避免下次重复核验。
- `data/interviews.json` 仍然只保存最终确认的访谈，不保存检索过程、转载或候选线索。

每个人物的来源条目直接保存来源角色，目前只保留四种：

- `subject_official`：受访者本人或所属机构官方；
- `interview_media`：原创采访媒体；
- `program_producer`：节目制作方；
- `event_organizer`：活动主办方。

`channels.json` 登记的是具体原始发布者或其内容档案，不登记“哔哩哔哩”“小宇宙”“微信”这类通用平台。只有能够核验发布者身份、确实可能提供完整一手谈话内容，并有稳定检索入口的来源才加入。来源清单用于提高发现概率，不代表其中每条内容都会自动收录；具体内容仍需通过完整、一手、谈话形式和排除类型检查。

默认情况下，搜索计划从渠道 `url` 提取一个域名。若同一来源还需要检查电子报、视频子站等其他域名，可以增加可选的 `search_domains` 数组；生成器会逐个域名生成查询。`url` 仍然表示渠道入口，`search_domains` 只控制定向搜索范围。

检索状态只有三种：

- `partial`：只查了部分范围，下次还要继续；
- `completed`：计划查询已全部执行，并且结果已经耗尽或达到“连续两页没有新候选”的停止条件；
- `blocked`：受到登录、页面或其他限制，当前无法继续。

检索方式只有两种：

- `trusted_channel`：优先检查 `channels.json` 已登记的可信一手来源，必须填写对应的 `channel_id`；
- `broad_web`：在中文平台或全网进行补充检索，`channel_id` 填 `null`，并在 `platforms` 中写明实际检查的平台。

每条账本还用 `queries` 保存实际使用的检索词，用 `date_range` 保存本次覆盖的发布时间范围；无法限定时间时填 `null`。`counts` 分别统计看过的结果、形成的候选，以及候选中新增、合并重复和排除的数量。账本只描述检索过程，最终访谈仍然只进入 `interviews.json`。

标记为 `completed` 时必须填写 `completion_check`：`planned_queries_executed` 和 `stopping_rule_met` 都必须为 `true`，`methods_used` 必须说明实际使用了站内搜索、限定域名搜索或平台搜索中的哪些方式。遇到登录、robots、分页或公开索引限制而无法达到停止条件时，只能标记为 `partial` 或 `blocked`。

日常检索先运行 `npm run search-plan -- <person_id>`。默认输出可勾选的 Markdown 清单，使用 `--output <路径>` 可以保存为工作文件，使用 `--format json` 可以保留机器可读输出。程序会从人物标准名、别名、渠道名称和搜索域名自动生成两组清单：第一组是每个可信来源域名的 `site:` 定向查询，第二组是完成定向搜索后使用的全网补充查询。它只生成计划，不自动访问网页；执行者仍需核验原始发布者、完整性和内容类型。

检索时间范围是每次任务的运行参数，不是来源清单的固定属性。本轮王宁 MVP 的可信来源定向检索和全网补充检索统一覆盖 `2025-01-01` 至实际检索日；范围外内容可以作为线索看到，但不继续核验、不进入本轮候选，也不能据此宣称更早历史已经查完。

人物表、来源清单和检索账本的格式也由 `npm run validate` 一起检查。

## 自动收录和去重

候选访谈使用 `examples/candidate-interview.json` 的格式。筛选字段表明它是否为一手来源、是否完整、是否属于谈话，以及是否为需要排除的业绩会、新闻发布会或股东会。

运行：

```powershell
npm.cmd run import -- <候选访谈.json>
```

程序会自动执行以下处理：

- 不合格候选直接排除；
- 未发现重复的候选直接新增；
- 同一场访谈优先保留完整底稿，其次完整视频，再其次完整音频；
- 完整度相同时，优先保留已经登记在该人物 `channels.json` 清单中的来源；
- 两边都已登记或都未登记时保留现有来源，避免反复替换；
- 自动判断经过写入 `data/dedup-log.json`，便于追溯。
- 被明确排除的重要候选还会写入 `data/reviewed-candidates.json`，下次搜索时可以直接识别已经判断过的链接。

搜索过程中若已经能确定结果不合格，不需要先制作完整候选 JSON，可以使用 `npm run review` 直接登记。排除原因代码包括 `not_primary`、`incomplete`、`not_conversation`、`excluded_event`、`person_not_participating`、`outside_date_range`、`duplicate_source` 和 `other`。导入程序会先检查同一人物下是否已有该规范化链接的排除记录；确需重新判断时使用 `--reconsider`，新结果会替换或移除旧判断。

自动合并会采用保守策略：相似度达到 `0.85` 才自动合并，`0.65` 至 `0.85` 之间暂停写入并提示人工确认，低于 `0.65` 时作为新访谈；时间相隔超过90天还会进一步压低相似度。人工确认后使用 `--force-new` 或 `--merge-with <已有访谈id>` 明确处理。`channels.json` 不设置来源优先级，清单内来源一律按可信来源处理。

## 内容整理和核验

收录事件后，可以在 `interviews.json` 中补充三个成组字段：

- `content_summary`：整场内容概括；
- `key_points`：关键内容及原文标题或音视频时间点；
- `content_review`：整理所依据的一手页面、核验日期与完成状态。

三个字段一旦出现就必须同时填写。`verified` 表示已经检查完整文字、视频或音频；`partial` 表示已经确认完整一手来源，但目前主要依据节目方简介或时间轴整理。报告会显式展示这一区别，不把项目方概括冒充人物原话。

## 报告生成

`scripts/generate-report.js` 是通用报告生成器。它按人物编号读取 `people.json`、`search-log.json` 和 `interviews.json`，在 `reports/` 下输出一份报告。报告包含检索日期范围、完成的定向与全网检索次数、内容核验统计，以及按发布日期从新到旧排列的访谈详情。

当前示例：

- `reports/wang-ning.md`：王宁在本轮日期范围内的 MVP 报告；
- 黄仁勋尚未跑完与王宁相同的检索和内容整理流程，因此暂不生成正式完整报告。

## 项目目录

```text
tracker/
├─ data/                         核心数据
│  ├─ people.json                人物及检索别名
│  ├─ channels.json              按人物分组的可信来源地图
│  ├─ search-log.json            定向检索与全网检索账本
│  ├─ reviewed-candidates.json    已人工判断的重要排除候选
│  ├─ interviews.json            去重后的最终访谈及内容摘要
│  └─ dedup-log.json             自动收录和去重判定记录
├─ examples/                     候选访谈输入示例
├─ scripts/
│  ├─ validate-data.js           检查数据格式和跨文件关联
│  ├─ generate-search-plan.js    生成人物定向与全网搜索计划
│  ├─ dedup-core.js              判断同一事件并选择最佳来源
│  ├─ import-interview.js         导入候选并写入结果与日志
│  ├─ review-candidate.js        手工登记重要排除候选
│  └─ generate-report.js         按日期倒序生成指定人物报告
├─ tests/                        数据、检索、去重和报告自动测试
├─ reports/
│  └─ wang-ning.md               当前王宁 MVP 报告
├─ package.json                  可执行命令入口
├─ PROGRESS.md                   每个开发小步的简短记录
└─ README.md                     项目规则、流程和使用说明
```

## 当前边界

- 王宁：完成 `2025-01-01` 至 `2026-08-13` 公开可检索范围的 MVP；
- 黄仁勋：只完成 NVIDIA 官方来源的一场试跑，不代表完整覆盖；
- 当前检索执行仍需要实际发起搜索和核验网页，并非后台自动爬虫；
- 受登录、robots、站内搜索和公开索引限制的平台，不能宣称获得内部数据库的绝对全量结果；
- 完整音视频的逐段转写与核验尚未自动化，`partial` 内容仍需后续升级为 `verified`。
