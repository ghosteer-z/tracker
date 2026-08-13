# 开发小结

## 第一步：确定最小收录规则和数据格式

这一步明确了“一场访谈只留一条记录”的规则，完整来源按文字底稿、视频、音频的顺序择优保留，并排除了转载、片段、业绩会、新闻发布会和股东会；产出了 `README.md`，用于解释项目规则和协作流程，产出了 `data/interviews.json`，用于保存最终访谈清单及三个王宁验证样本，还产出了 `scripts/validate-interviews.js` 和 `package.json`，用于通过 `npm run validate` 自动检查数据格式、来源链接和明显重复。

## 第二步：建立黄仁勋官方渠道地图并完成一次试跑

这一步新增了五个高价值NVIDIA官方检索入口，并用NVIDIA On-Demand上的2023年GTC对谈走通一次小范围试跑；产出了 `data/channels.json`，用于说明去哪里找、各渠道能找到什么以及怎样检索，产出了 `data/search-log.json`，用于记录本次只检查了一场而非全量覆盖以及下次从哪里继续，在 `data/interviews.json` 中新增了黄仁勋与Ilya Sutskever的完整官方对谈，还将校验器升级为 `scripts/validate-data.js`，用于同时检查访谈、渠道及检索账本之间的关联。

## 第三步：把人物和一手来源改成通用结构

这一步让项目支持任意人物，并按更直观的方式把每个人的一手来源连续放在 `data/channels.json` 的同一人物组中；`data/people.json` 用于集中保存人物标准姓名和检索别名，来源条目自身说明它是受访者官方、原创媒体、节目制作方还是活动主办方，`data/search-log.json` 只需记录本次查谁和查哪个来源，升级后的 `scripts/validate-data.js` 则负责保证检索引用的来源确实属于对应人物。以后新增人物时追加一个人物组，新增来源时追加到该人物组末尾，不需要额外的覆盖清单。

## 第四步：自动判断重复并择优收录

这一步把参与者字段统一改为 `other_participants`，并增加了无需人工确认的候选收录流程；产出了 `scripts/import-interview.js`，用于接收候选访谈并自动排除、收录或合并，`scripts/dedup-core.js` 用于比较人物、链接、节目、标题、参与者和日期并按底稿、视频、音频的顺序择优，`data/dedup-log.json` 用于保存每次自动判断及理由，`examples/candidate-interview.json` 用于说明候选数据格式，自动化测试则验证了保留可信来源、用更完整底稿替换、新访谈收录、不合格内容排除和错误格式拦截五条路径。
