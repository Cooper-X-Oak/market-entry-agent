# 工业品出海市场进入 Agent V1 产品需求文档

## 文档信息

| 项目 | 内容 |
|---|---|
| 产品名称 | Industrial Market Entry Agent |
| 中文名称 | 工业品出海市场进入 Agent |
| 版本 | V1 |
| 文档类型 | 可直接开发的产品与工程 PRD |
| 主要使用者 | 工业企业出海负责人，营销服务商，海外销售人员，市场研究人员 |
| 核心目标 | 从少量企业信息出发，形成透明的市场进入判断，发现目标组织与利益相关者，验证公开触达路径，生成可直接执行的市场进入行动包，并通过人工记录的真实互动持续更新机会状态 |
| 核心业务对象 | 可触达的市场进入机会 |
| 核心交付物 | 市场进入行动包 |
| 核心衡量指标 | 单位销售资源产生的、经过验证的商业机会价值 |

## 一 产品定义

Industrial Market Entry Agent 是一个面向工业企业出海的市场进入与关系激活系统

系统接收企业名称，官方网站，主要产品，目标国家与目标客户方向等少量信息

系统持续完成以下工作

1 解析企业现有公开材料，建立企业能力证据账本

2 研究目标市场的主要进入路线

3 建立产业生态，竞争对手，行业专家，目标组织与利益相关者图谱

4 为高优先级目标发现并验证公开触达路径

5 将市场判断转化为具体联系人，具体渠道，具体联系理由与具体下一步动作

6 将用户的确认，修改，联系方式结果与市场互动记录为可复用知识

7 根据新证据和真实互动更新机会优先级与行动计划

系统的首要交付单位是一个可执行的市场进入行动包

每个行动包必须回答

- 联系哪个组织
- 联系哪个角色或人员
- 通过什么渠道联系
- 为什么这个对象值得联系
- 为什么现在联系
- 对方可能关心什么
- 企业可以提供什么利益
- 首次联系希望确认什么
- 联系成功后进入哪个步骤
- 联系无响应后采用哪条备用路径
- 当前判断由哪些证据支撑
- 哪些关键问题仍待确认

## 二 V1 产品目标

### 2 1 业务目标

V1 完成一条完整的最小业务闭环

```text
用户创建市场任务
    ↓
系统编译任务范围
    ↓
系统提取最低可用企业能力证据
    ↓
系统研究市场进入路线
    ↓
用户确认进入路线
    ↓
系统建立产业生态与竞争图谱
    ↓
系统发现目标组织与利益相关者
    ↓
系统发现并验证公开触达路径
    ↓
系统生成市场进入行动包
    ↓
用户确认并导出行动包
    ↓
用户记录真实联系结果
    ↓
系统更新机会状态，市场判断与下一步动作
```

### 2 2 用户价值目标

用户在一个工作台中获得以下持续更新的结果

- 当前任务目标与范围
- 企业能力证据与关键未知项
- 市场进入路线及其证据
- 当地产业生态与组织关系
- 竞争对手的进入方式与市场动作
- 行业专家与从业者的观点
- 目标组织与利益相关者
- 公开联系方式与触达路径
- 机会优先级与判断依据
- 可直接执行的联系行动卡
- 真实互动记录与判断变化

### 2 3 工程目标

V1 采用以下工程原则

- PostgreSQL 保存业务事实与版本化产物
- Temporal 保存长期流程状态
- Agent Worker 执行边界清晰的推理任务
- Connector 执行搜索，网页获取，文档解析与联系方式验证
- 所有重要判断携带证据引用
- 所有状态变化写入领域事件
- 所有外部任务具备幂等键
- 所有 Agent 输出通过结构化 Schema 校验
- 用户可在白盒工作台确认，修改，否决与重新研究

## 三 V1 实现边界

### 3 1 V1 包含的能力

- 邮箱与密码登录
- 多租户工作区
- 市场任务创建与管理
- 企业网站与用户上传资料的解析
- 企业能力证据账本
- 市场进入路线研究
- 竞争对手研究
- 行业观点与专家线索研究
- 产业生态与组织图谱
- 目标组织发现与筛选
- 利益相关者角色映射
- 公开联系方式与触达路径发现
- 联系方式来源记录与基础验证
- 机会评分与透明解释
- 市场进入行动包生成
- 用户审批，导出与复制
- 人工互动结果录入
- 机会状态与下一步动作更新
- 全量决策时间线
- 每周一次的市场任务刷新
- 任务预算与并发控制
- Agent 运行与工具运行可观测性

### 3 2 V1 外联执行方式

V1 由系统生成行动卡与联系内容

用户通过复制内容，导出 CSV，导出 Markdown 或打开目标页面完成实际外联

用户在系统中记录已发送，已通话，已会面，收到回复，获得转介绍，进入采购流程等结果

系统根据记录更新机会与下一步动作

### 3 3 V1 默认研究规模

每个市场任务默认使用以下额度

| 项目 | 默认值 | 可配置范围 |
|---|---:|---:|
| 目标国家数量 | 1 | 1 至 3 |
| 市场进入路线数量 | 5 | 3 至 8 |
| 竞争对手数量 | 8 | 3 至 20 |
| 行业观点数量 | 12 | 5 至 30 |
| 目标组织数量 | 40 | 10 至 100 |
| 高优先级机会数量 | 20 | 5 至 50 |
| 每个组织利益角色数量 | 5 | 1 至 12 |
| 每个组织触达路径数量 | 4 | 1 至 10 |
| 搜索请求数量 | 80 | 20 至 300 |
| 网页抓取数量 | 120 | 30 至 500 |
| Agent 运行数量 | 200 | 50 至 800 |
| 每周刷新目标数量 | 20 | 5 至 100 |

## 四 用户角色与权限

### 4 1 Workspace Owner

权限范围

- 管理工作区
- 管理成员
- 创建与归档市场任务
- 配置模型与 Connector
- 配置预算
- 审批市场路线
- 审批行动卡
- 查看全部运行记录与成本
- 导出全部数据

### 4 2 Editor

权限范围

- 创建市场任务
- 编辑任务信息
- 上传资料
- 查看与修改能力声明
- 确认市场路线
- 调整目标组织优先级
- 审批行动卡
- 记录真实互动
- 导出行动包

### 4 3 Viewer

权限范围

- 查看市场任务
- 查看图谱，机会，行动卡与时间线
- 查看证据来源
- 导出已批准的行动包

## 五 核心领域对象

### 5 1 Market Mission

市场任务是一个企业产品范围进入一个或多个目标国家的持续研究与执行任务

必要字段

- 任务名称
- 企业名称
- 企业官网
- 主要产品
- 目标国家
- 目标行业
- 目标客户或合作对象描述
- 本轮业务目标
- 成功标准
- 预算与规模限制
- 生成内容语言

### 5 2 Capability Claim

企业能力声明是系统当前知道的企业能力事实，推断与未知项

必要字段

- 声明内容
- 声明类型
- 当前状态
- 置信度
- 证据来源
- 对当前任务的影响
- 用户确认状态
- 最近更新时间

声明状态

- observed
- inferred
- user_confirmed
- contradicted
- unknown
- superseded

### 5 3 Market Route

市场进入路线描述企业在目标市场中通过何种商业结构接近客户

路线类型

- channel
- direct_purchase
- epc
- tender
- exhibition
- association
- expert_network
- referral
- hybrid

必要字段

- 路线名称
- 路线类型
- 路线假设
- 适用场景
- 关键组织类型
- 首要利益相关者
- 主要联系渠道
- 进入要求
- 支撑证据
- 反向证据
- 置信度
- 进入难度
- 时间成本
- 资源成本
- 用户决策

### 5 4 Entity

Entity 统一表示组织，个人，项目，展会，协会，政府机构与行业事件

实体类型

- organization
- person
- project
- exhibition
- association
- government_body
- industry_event

### 5 5 Relationship

Relationship 表示实体之间的业务关系

关系类型

- distributes
- imports
- purchases_from
- supplies_to
- designs_for
- builds_for
- owns
- operates
- employs
- participates_in
- member_of
- certified_by
- awarded_contract
- competes_with
- refers_to
- partners_with
- represents

### 5 6 Stakeholder Role

利益相关者角色描述一个组织内部或市场生态中的具体影响位置

角色类型

- end_user
- technical_influencer
- procurement
- budget_owner
- executive_approver
- channel_partner
- importer
- distributor
- epc_engineer
- tender_agent
- supplier_onboarding
- association_contact
- industry_expert
- exhibition_contact
- local_service_partner

### 5 7 Contact Point

Contact Point 是能够抵达利益相关角色的公开触达路径

触达类型

- direct_email
- role_email
- phone
- contact_form
- social_profile
- procurement_portal
- supplier_registration
- exhibition_booking
- association_intro
- referral_path
- office_address

必要字段

- 所属组织
- 对应人员
- 对应利益角色
- 触达类型
- 触达值
- 来源
- 来源位置
- 是否公开
- 首次发现时间
- 最近验证时间
- 验证状态
- 置信度
- 推荐顺序
- 适用语言
- 当地时区
- 备用路径说明

### 5 8 Opportunity

Opportunity 表示一个已经具备市场意义，明确利益角色与触达路径的市场进入机会

必要字段

- 目标组织
- 市场路线
- 机会假设
- 利益相关者
- 主要触达路径
- 备用触达路径
- 机会评分
- 商业价值区间
- 预计销售工时
- 资源效率
- 当前状态
- 下一步动作
- 证据与未知项

### 5 9 Action Card

Action Card 是用户可直接执行的市场进入行动包

必要字段

- 目标组织
- 目标角色
- 目标人员或部门
- 主要联系方式
- 备用联系方式
- 推荐渠道
- 联系理由
- 当前时机
- 对方利益点
- 企业价值主张
- 首次联系目标
- 邮件主题
- 邮件正文
- 社交平台短消息
- 电话开场提纲
- 所需附件
- 跟进计划
- 成功信号
- 完成条件
- 负责人
- 截止时间

## 六 端到端业务流程

### 6 1 创建市场任务

用户进入新建任务向导并填写

第一步 企业信息

- 企业名称
- 企业官网
- 主要产品
- 产品描述
- 可选上传资料

第二步 市场信息

- 目标国家
- 目标行业
- 目标客户类型
- 已知竞争对手
- 已知渠道或客户

第三步 业务目标

- 希望寻找的合作形式
- 本轮成功标准
- 期望目标组织数量
- 期望行动包数量
- 生成语言

第四步 预算

- 搜索请求上限
- 网页抓取上限
- Agent 运行上限
- 目标组织上限
- 每周刷新数量

提交后创建 Market Mission 并启动 Mission Workflow

### 6 2 编译任务卡

Mission Compiler 消费用户输入并生成结构化任务卡

任务卡包含

- 标准化企业名称
- 标准化产品范围
- 标准化目标国家
- 标准化目标行业
- 目标组织类型
- 合作模式偏好
- 成功标准
- 预算
- 已知事实
- 初始假设
- 待确认问题

任务卡以 Artifact Version 形式保存

系统在工作台展示任务卡

用户可编辑并确认

### 6 3 企业资料解析

系统自动执行

- 抓取企业官网首页
- 抓取产品页面
- 抓取案例页面
- 抓取认证页面
- 抓取联系页面
- 解析用户上传资料
- 保存网页快照与文件原件
- 将内容切分并生成向量
- 提取能力声明

能力声明分类

- product
- application
- certification
- manufacturing
- delivery
- service
- geography
- channel
- pricing
- case_study
- customization
- unknown_requirement

每条能力声明显示

- 声明文本
- 状态标签
- 证据数量
- 来源链接
- 置信度
- 影响的市场路线
- 用户操作

用户操作

- 确认
- 修改
- 标记冲突
- 添加资料
- 请求重新提取
- 锁定为当前任务事实

### 6 4 市场进入路线研究

系统为目标国家生成三至八条路线候选

每条路线必须包含

- 路线类型
- 当地市场结构说明
- 主要参与组织
- 首要利益相关者
- 常见触达方式
- 企业当前适配条件
- 仍待确认的企业能力
- 支撑证据
- 反向证据
- 置信度
- 预计进入时间
- 预计资源消耗
- 推荐优先级

系统同步完成

- 竞争对手进入方式研究
- 行业观点研究
- 招投标与公开项目信号研究
- 当地协会与展会研究

用户在路线评审页完成

- 批准路线
- 调整优先级
- 编辑路线假设
- 选择重点组织类型
- 追加研究问题
- 启动下一阶段

至少一条路线进入 approved 状态后，系统进入生态发现阶段

### 6 5 产业生态与组织图谱

系统围绕已批准路线发现实体与关系

发现对象包括

- 终端企业
- 进口商
- 经销商
- EPC
- 系统集成商
- 设计机构
- 招标代理
- 供应商注册机构
- 行业协会
- 商会
- 展会
- 行业专家
- 当地服务商
- 竞争对手
- 公开项目

每个实体进入数据库前执行实体消歧

实体消歧依据

- 官方域名
- 注册编号
- 官方名称
- 地址
- 国家与城市
- 品牌别名
- 社交平台主页
- 公开项目中的名称

图谱页面提供

- 图形视图
- 表格视图
- 实体筛选
- 关系筛选
- 国家筛选
- 路线筛选
- 置信度筛选
- 证据抽屉
- 实体详情抽屉

用户可以将任意组织提升为目标组织

### 6 6 目标组织发现与排序

系统为每个目标组织生成目标卡

目标卡包含

- 组织名称
- 官方网站
- 国家与城市
- 市场角色
- 所属路线
- 与企业产品的匹配理由
- 当前需求信号
- 当前时机信号
- 竞争对手关联
- 公开项目关联
- 利益相关者覆盖情况
- 触达路径覆盖情况
- 证据质量
- 初始机会评分

目标组织排序依据

- 产品适配
- 路线适配
- 需求信号
- 时机信号
- 市场角色重要性
- 可触达性
- 证据质量
- 战略价值
- 预计销售工时

用户可执行

- 提升优先级
- 降低优先级
- 锁定目标
- 归档目标
- 追加研究
- 创建机会

### 6 7 利益相关者映射

系统为高优先级目标识别以下角色

- 使用者
- 技术影响者
- 采购负责人
- 预算负责人
- 管理层审批者
- 供应商准入负责人
- 渠道负责人
- 当地服务负责人
- 项目负责人
- 转介绍节点

每个角色记录

- 角色类型
- 职位名称
- 对应人员
- 对业务决策的影响程度
- 与路线的关系
- 联系优先级
- 证据
- 当前未知项

系统支持人员未知但部门已知的角色

例如

- Procurement Department
- Supplier Qualification Team
- Project Engineering Team
- Channel Partnership Team

### 6 8 联系方式与触达路径发现

系统按照以下来源优先级寻找联系方式

第一优先级

- 企业官方网站
- 官方联系页面
- 团队页面
- 采购门户
- 供应商注册页面
- 官方新闻稿
- 官方展会页面
- 官方社交主页

第二优先级

- 搜索引擎公开索引
- 行业协会页面
- 商会会员页面
- 招投标公告
- 中标公告
- 项目审批与公示
- 企业注册公示
- 认证名录
- 展会参展商名单
- 会议嘉宾页面

第三优先级

- 职业社交平台公开页面
- 行业社区公开页面
- 专业论坛公开页面
- 用户提供的联系人与页面

每个高优先级目标至少产出

- 一条主要触达路径
- 一条备用触达路径
- 一个明确的利益角色
- 一个联系理由
- 一个首次联系目标

联系方式验证规则

- URL 可访问性验证
- 邮箱格式验证
- 邮箱域名 MX 验证
- 官方来源直接确认
- 多来源交叉确认
- 人员任职状态确认
- 最近验证时间记录
- 公开属性记录

验证状态

- discovered
- format_valid
- source_confirmed
- cross_confirmed
- manually_confirmed
- stale
- invalid

联系方式排序规则

1 官方公开且直接对应目标角色

2 官方公开的部门邮箱或采购入口

3 官方公开的联系表单或供应商注册入口

4 多来源确认的职业社交主页

5 公开展会预约或协会介绍路径

6 具有明确依据的角色级候选路径

### 6 9 竞争对手研究

每个目标市场默认建立三至八个竞争对手档案

竞争对手档案包含

- 当地官网或区域页面
- 当地办公室
- 当地员工
- 经销商与代理商
- 参展记录
- 行业协会参与
- 公开客户与案例
- 中标与项目信息
- 产品定位
- 认证
- 服务网络
- 招聘岗位
- 主要联系入口
- 市场最低门槛
- 可超越空间

竞争对手研究结果被以下模块消费

- 市场路线评分
- 目标组织匹配
- 企业能力缺口
- 联系方式来源扩展
- 行动卡价值主张

### 6 10 行业观点与专家线索

系统发现并记录

- 行业协会负责人
- 顾问
- 专业媒体作者
- 技术专家
- 展会演讲嘉宾
- 经销商负责人
- 采购与项目从业者

每条行业观点包含

- 发言者
- 所属机构
- 观点主题
- 观点摘要
- 观点时间
- 信息来源
- 与真实交易的距离
- 可信度
- 商业立场
- 对市场进入判断的影响
- 是否存在公开触达路径
- 可能的合作方式

可能的合作方式

- 市场访谈
- 付费咨询
- 内容合作
- 技术合作
- 渠道介绍
- 协会引荐
- 展会会面

### 6 11 机会创建与资格判断

系统为满足以下条件的目标创建 Opportunity

- 组织实体已完成消歧
- 组织角色与批准路线相关
- 至少一个利益角色已识别
- 至少一条触达路径已发现
- 机会假设可由证据解释
- 机会评分达到任务阈值

机会状态

```text
observed
    ↓
target_identified
    ↓
stakeholder_mapped
    ↓
contact_path_found
    ↓
contact_path_verified
    ↓
action_ready
    ↓
approved
    ↓
contacted
    ↓
responded
    ↓
qualified
    ↓
meeting
    ↓
supplier_registration
    ↓
sample
    ↓
quotation
    ↓
won
```

并行终止状态

- archived
- paused
- lost

每次状态迁移记录

- 迁移前状态
- 迁移后状态
- 触发事件
- 使用证据
- 操作人或 Agent
- 时间
- 备注

### 6 12 行动卡生成

每个 action_ready 机会生成一张行动卡

行动卡内容

#### 基本信息

- 目标组织
- 目标国家
- 所属路线
- 当前机会状态
- 当前优先级

#### 联系对象

- 目标利益角色
- 目标人员或部门
- 主要联系方式
- 备用联系方式
- 联系方式来源
- 最近验证时间

#### 联系策略

- 为什么联系这个组织
- 为什么联系这个角色
- 为什么现在联系
- 对方可能关心的问题
- 企业可以提供的价值
- 首次联系目标

#### 生成内容

- 邮件主题
- 邮件正文
- 社交平台短消息
- 电话开场提纲
- 联系表单短文

#### 执行要求

- 推荐渠道
- 推荐发送时间
- 使用语言
- 所需附件
- 负责人
- 截止时间
- 跟进计划
- 成功信号
- 完成条件

#### 判断依据

- 支撑证据
- 反向证据
- 当前未知项
- 机会评分解释
- 用户修改记录

用户操作

- 批准
- 修改
- 请求重新生成
- 更换联系人
- 更换渠道
- 调整首次联系目标
- 复制内容
- 导出 Markdown
- 导出 CSV
- 标记已执行

### 6 13 真实互动记录

用户可为机会新增互动

互动类型

- email_sent
- message_sent
- call
- meeting
- form_submitted
- supplier_registration
- exhibition_meeting
- referral
- response
- qualification_update
- sample_sent
- quotation_sent

互动表单字段

- 互动时间
- 互动类型
- 联系对象
- 使用渠道
- 互动摘要
- 对方原话
- 结果
- 新事实
- 下一步动作
- 下次跟进时间
- 附件

保存互动后系统执行

- 提取新事实
- 创建或更新能力声明
- 更新联系方式状态
- 更新市场路线置信度
- 更新机会评分
- 推荐新状态
- 生成下一步行动卡版本
- 写入决策时间线

### 6 14 每周刷新

每个 active 市场任务创建一个每周刷新计划

刷新范围

- 前二十个高优先级目标
- 三十天以上未验证的联系方式
- 已批准路线的关键来源
- 主要竞争对手
- 未来九十天内的展会与项目
- paused 状态且存在新信号的机会

刷新结果

- 新增证据
- 失效证据
- 联系人变化
- 新项目
- 新招标
- 新竞争对手动作
- 新行业观点
- 路线变化建议
- 机会重新排序建议

用户在刷新中心查看并逐项接受更新

## 七 白盒工作台

### 7 1 白盒原则

系统对用户持续暴露以下内容

- 当前事实
- 当前推断
- 当前未知项
- 当前矛盾
- 当前证据
- 当前决策
- 当前执行状态
- 当前预算消耗
- 当前下一步动作

每条判断显示标签

- Fact
- Inference
- Unknown
- User Confirmed
- Contradiction
- Superseded

每条判断显示

- 结论
- 置信度
- 证据数量
- 来源
- 获取时间
- 影响的路线或机会
- 生成者
- 用户操作

### 7 2 用户干预能力

用户可以

- 确认事实
- 修改事实
- 标记冲突
- 锁定结论
- 补充证据
- 请求重新研究
- 批准路线
- 调整路线优先级
- 提升目标组织
- 归档目标组织
- 更换联系人
- 更换联系方式
- 修改行动卡
- 记录真实互动
- 暂停任务
- 恢复任务

每次操作生成 Domain Event

## 八 页面与交互规格

### 8 1 登录页

路由

```text
/login
/register
```

登录页字段

- 邮箱
- 密码
- 登录按钮
- 注册入口

注册页字段

- 姓名
- 工作区名称
- 邮箱
- 密码
- 创建账户按钮

### 8 2 仪表盘

路由

```text
/dashboard
```

页面区域

#### 顶部指标

- 运行中的市场任务
- 高优先级机会
- 已验证触达路径
- 待审批行动卡
- 本周新增有效互动
- 本月研究成本

#### 市场任务列表

字段

- 任务名称
- 企业
- 目标国家
- 当前阶段
- 已批准路线数
- 目标组织数
- 已验证触达路径数
- 行动卡数
- 最近更新时间
- 负责人

#### 待办区域

- 待确认任务卡
- 待批准路线
- 待批准行动卡
- 待处理刷新结果
- 待跟进机会

### 8 3 新建任务向导

路由

```text
/missions/new
```

采用四步表单

- Company
- Market
- Goal
- Budget

页面底部固定显示

- 上一步
- 保存草稿
- 下一步
- 创建任务

### 8 4 市场任务工作台

路由

```text
/missions/:missionId
```

顶部区域

- 任务名称
- 当前阶段
- 运行状态
- 目标国家
- 预算使用率
- 暂停按钮
- 继续按钮
- 刷新按钮
- 导出按钮

左侧导航

- Overview
- Capability Ledger
- Market Routes
- Ecosystem
- Targets
- Contact Paths
- Opportunities
- Action Queue
- Refresh Center
- Timeline
- Runs

### 8 5 Overview 页

显示

- 任务卡摘要
- 当前阶段
- 进度条
- 核心指标
- 当前批准路线
- 当前高优先级机会
- 当前待办
- 最近五条判断变化
- 最近五条互动

### 8 6 Capability Ledger 页

布局

- 左侧分类筛选
- 中部声明表格
- 右侧证据抽屉

表格列

- 声明
- 分类
- 状态
- 置信度
- 证据数
- 影响路线
- 更新时间
- 操作

### 8 7 Market Routes 页

每条路线使用卡片展示

卡片字段

- 排名
- 路线名称
- 路线类型
- 置信度
- 进入难度
- 资源强度
- 预计首个有效联系时间
- 关键组织类型
- 支撑证据数
- 反向证据数
- 当前状态

卡片操作

- 查看详情
- 批准
- 调整优先级
- 编辑假设
- 追加研究

详情抽屉

- 路线说明
- 适用场景
- 企业适配
- 能力要求
- 关键利益相关者
- 主要触达渠道
- 竞争对手案例
- 行业观点
- 证据与反证
- 待确认问题

### 8 8 Ecosystem 页

上方筛选

- 实体类型
- 市场角色
- 路线
- 国家
- 置信度
- 是否为目标

中部图谱

- 节点大小表示重要性
- 节点边框表示实体类型
- 边表示业务关系
- 点击节点打开实体抽屉
- 点击边打开关系证据抽屉

下方表格

- 名称
- 类型
- 市场角色
- 关联路线
- 关系数
- 证据数
- 目标状态
- 机会状态

### 8 9 Targets 页

表格列

- 排名
- 组织
- 国家
- 市场角色
- 主要路线
- 产品适配
- 需求信号
- 可触达性
- 证据质量
- 最终得分
- 当前状态
- 操作

支持批量操作

- 创建机会
- 请求补充研究
- 导出
- 调整优先级

### 8 10 Contact Paths 页

表格列

- 组织
- 利益角色
- 人员或部门
- 类型
- 联系方式
- 来源
- 验证状态
- 置信度
- 最近验证时间
- 推荐顺序
- 当前使用状态

操作

- 查看来源
- 手动确认
- 标记失效
- 设为主要路径
- 设为备用路径
- 重新验证

### 8 11 Opportunities 页

提供看板与表格两种视图

看板列

- Target Identified
- Stakeholder Mapped
- Contact Found
- Contact Verified
- Action Ready
- Approved
- Contacted
- Responded
- Qualified

机会卡字段

- 组织
- 路线
- 当前得分
- 商业价值区间
- 资源效率
- 主要联系人
- 下一步动作
- 最近更新时间

### 8 12 Opportunity 详情页

路由

```text
/missions/:missionId/opportunities/:opportunityId
```

页面区域

- 机会摘要
- 机会评分
- 目标组织
- 利益相关者
- 联系方式
- 市场路线
- 证据与反证
- 行动卡
- 互动时间线
- 状态迁移记录

### 8 13 Action Queue 页

分组

- 待审批
- 已批准待执行
- 今日到期
- 待跟进
- 已完成

行动卡支持

- 快速预览
- 批准
- 编辑
- 复制邮件
- 复制短消息
- 导出
- 标记已执行
- 新增互动结果

### 8 14 Refresh Center 页

显示每周刷新产生的变化建议

变化类型

- 新证据
- 联系方式变化
- 路线变化
- 竞争对手变化
- 新项目
- 新展会
- 新专家观点
- 机会重新排序

用户操作

- 接受更新
- 查看来源
- 请求补充研究
- 稍后处理

### 8 15 Timeline 页

按时间倒序展示

- 用户操作
- Agent 判断
- 工具结果
- 产物版本变化
- 路线审批
- 联系方式验证
- 行动卡审批
- 互动记录
- 机会状态变化

每条时间线记录支持展开查看

- 输入
- 输出
- 证据
- 影响对象
- 运行编号

### 8 16 Runs 页

表格字段

- 运行类型
- Agent Skill
- 状态
- 输入产物
- 输出产物
- 模型
- Token
- 成本
- 耗时
- 开始时间
- 错误信息


### 8 17 视觉与布局规范

V1 使用桌面优先的 B2B 工作台布局

全局布局

- 左侧主导航宽度 240 像素
- 顶部栏高度 64 像素
- 内容区最大宽度 1600 像素
- 内容区间距 24 像素
- 卡片圆角 10 像素
- 表格行高 48 像素
- 抽屉宽度 560 像素
- 详情页双栏比例 7 比 5

颜色 Token

```text
background       #F8FAFC
surface          #FFFFFF
surface_muted    #F1F5F9
text_primary     #0F172A
text_secondary   #475569
border           #E2E8F0
primary          #2563EB
primary_hover    #1D4ED8
success          #15803D
warning          #B45309
danger           #B91C1C
info             #0369A1
```

判断标签

| 标签 | 展示文本 | 色彩语义 |
|---|---|---|
| observed | Fact | success |
| inferred | Inference | info |
| unknown | Unknown | warning |
| user_confirmed | User Confirmed | primary |
| contradicted | Contradiction | danger |
| superseded | Superseded | text_secondary |

置信度展示

- 0 至 39 显示 Low
- 40 至 69 显示 Medium
- 70 至 100 显示 High
- 同时显示数值与进度条

统一页面状态

- loading 使用 Skeleton
- empty 使用业务说明与主操作按钮
- failed 使用错误摘要，运行编号与重试按钮
- awaiting_user 使用高亮待办卡
- running 使用阶段名称，进度与当前工位
- completed 使用完成指标与导出入口

### 8 18 表格交互规范

所有主要表格支持

- 服务端分页
- 排序
- 多条件筛选
- 列显示管理
- 行选择
- 批量操作
- CSV 导出
- URL Query 保存筛选状态

默认分页

- page 1
- pageSize 50
- pageSize 可选 25，50，100

表格详情使用右侧 Drawer

Drawer 顶部固定显示

- 对象名称
- 状态
- 置信度
- 主要操作

Drawer 内容按以下顺序

- 摘要
- 证据
- 关系
- 版本
- 时间线

### 8 19 任务阶段进度

| Stage | 进度 |
|---|---:|
| draft | 0 |
| compiling | 5 |
| ingesting_company_data | 15 |
| researching_routes | 30 |
| awaiting_route_review | 40 |
| researching_ecosystem | 55 |
| researching_targets | 70 |
| researching_contacts | 85 |
| generating_actions | 95 |
| active | 100 |
| completed | 100 |

Mission Overview 同时展示

- 总体进度
- 当前工位
- 已完成工位
- 正在执行的 Activity
- 等待用户的审批
- 剩余预算

### 8 20 文案与语言

- 工作台界面使用简体中文
- 领域对象保留英文枚举值
- 用户可选择行动卡输出语言
- 每条生成内容保存 language 字段
- 目标国家存在多种业务语言时生成一个主版本与可选翻译版本
- 来源原文保持原始语言
- 证据摘要生成简体中文版本

## 九 机会评分与资源效率

### 9 1 评分维度

每项范围为 0 至 100

| 维度 | 权重 |
|---|---:|
| product_fit | 15 |
| route_fit | 15 |
| demand_signal | 15 |
| timing_signal | 10 |
| stakeholder_relevance | 10 |
| contactability | 15 |
| evidence_quality | 10 |
| strategic_value | 10 |

基础分计算

```text
base_score =
product_fit × 0.15 +
route_fit × 0.15 +
demand_signal × 0.15 +
timing_signal × 0.10 +
stakeholder_relevance × 0.10 +
contactability × 0.15 +
evidence_quality × 0.10 +
strategic_value × 0.10
```

置信度系数

| 证据置信度 | 系数 |
|---|---:|
| low | 0.70 |
| medium | 0.85 |
| high | 1.00 |

可执行性系数

| 触达状态 | 系数 |
|---|---:|
| target_only | 0.60 |
| stakeholder_mapped | 0.75 |
| contact_found | 0.85 |
| contact_verified | 1.00 |

最终分

```text
final_score = round(base_score × evidence_multiplier × execution_multiplier)
```

### 9 2 商业价值区间

用户可选择

- very_low
- low
- medium
- high
- strategic

系统为每个区间配置内部价值点

| 区间 | 价值点 |
|---|---:|
| very_low | 10 |
| low | 25 |
| medium | 50 |
| high | 75 |
| strategic | 100 |

### 9 3 销售资源成本

记录

- 预计销售工时
- 预计技术支持工时
- 预计市场费用
- 预计样品费用
- 预计差旅费用

V1 资源成本点

```text
resource_cost =
sales_hours × 1 +
technical_hours × 1.5 +
market_cost_points +
sample_cost_points +
travel_cost_points
```

### 9 4 机会价值与资源效率

```text
verified_opportunity_value =
commercial_value_points ×
final_score ÷ 100
```

```text
resource_efficiency =
verified_opportunity_value ÷ max(resource_cost, 1)
```

界面同时展示

- 最终机会分
- 商业价值区间
- 预计资源成本
- 资源效率
- 评分解释
- 用户调整记录

## 十 状态机

### 10 1 Mission 状态机

```text
draft
    ↓
compiling
    ↓
ingesting_company_data
    ↓
researching_routes
    ↓
awaiting_route_review
    ↓
researching_ecosystem
    ↓
researching_targets
    ↓
researching_contacts
    ↓
generating_actions
    ↓
active
    ↓
completed
```

并行状态

- paused
- failed
- archived

### 10 2 Artifact Version 状态机

```text
proposed
    ↓
accepted
    ↓
superseded
```

并行状态

- changes_requested
- rejected

### 10 3 Contact Point 状态机

```text
discovered
    ↓
format_valid
    ↓
source_confirmed
    ↓
cross_confirmed
    ↓
manually_confirmed
```

并行状态

- stale
- invalid

### 10 4 Action Card 状态机

```text
draft
    ↓
review
    ↓
approved
    ↓
exported
    ↓
executed
    ↓
completed
```

并行状态

- changes_requested
- cancelled

## 十一 技术架构

### 11 1 技术栈

| 层 | 技术选择 |
|---|---|
| Monorepo | pnpm workspace 与 Turborepo |
| 前端 | Next.js 15，React 19，TypeScript，Tailwind CSS，shadcn ui |
| API | NestJS 11，Fastify Adapter，TypeScript |
| Workflow | Temporal TypeScript SDK |
| Agent Runtime | OpenAI Agents SDK TypeScript，自有 AgentRunner 封装 |
| Schema | Zod |
| 数据库 | PostgreSQL 16，pgvector |
| ORM | Drizzle ORM |
| 对象存储 | S3 Compatible Storage，开发环境使用 MinIO |
| 搜索 | Tavily Connector |
| 浏览器 | Playwright Worker |
| HTML 解析 | Readability，Cheerio |
| 文档解析 | PDF 文本解析器，Office 文档解析器 |
| 图谱展示 | React Flow |
| 表格 | TanStack Table |
| 客户端数据 | TanStack Query |
| 实时更新 | Server Sent Events |
| 认证 | NestJS JWT 与 HttpOnly Cookie，Argon2 密码哈希 |
| 日志 | Pino |
| 可观测性 | OpenTelemetry |
| 测试 | Vitest，Jest，Playwright，Temporal Test Environment |
| 本地基础设施 | Docker Compose |

### 11 2 总体拓扑

```text
Browser
    ↓
Next.js Web
    ↓
NestJS API
    ↙           ↘
PostgreSQL      Temporal Client
    ↑               ↓
Projector       Temporal Server
                    ↓
              Temporal Workers
              ↙      ↓       ↘
        Agent Runner Search  Browser
              ↓       ↓       ↓
            OpenAI  Tavily  Playwright
                    ↓
              Source Snapshots
                    ↓
              MinIO or S3
```

### 11 3 服务划分

```text
apps
  web
  api
  worker
  projector

packages
  domain
  contracts
  workflows
  agents
  connectors
  evidence
  policies
  evals
  observability
  database
  config
```

### 11 4 模块职责

#### apps web

- 页面渲染
- 用户交互
- SSE 订阅
- 图谱展示
- 表格与详情抽屉
- 审批与编辑
- 导出与复制

#### apps api

- 认证
- 权限校验
- REST API
- 文件上传
- Temporal Workflow 启动与 Signal
- 数据查询
- 审批写入
- Interaction 写入
- SSE 事件流

#### apps worker

- Temporal Workflow Worker
- Agent Activity
- Connector Activity
- Artifact 持久化
- 质量门
- 机会评分
- 周期刷新

#### apps projector

- 消费 outbox_events
- 更新前端读取模型
- 发送 SSE 事件
- 生成聚合指标

#### packages domain

- Entity
- Mission
- Route
- Opportunity
- Contact Point
- Action Card
- 状态机
- 评分规则
- 质量门

#### packages contracts

- Zod Schema
- API DTO
- Agent 输入输出合同
- Domain Event Schema
- Connector Schema

#### packages workflows

- MissionWorkflow
- OpportunityWorkflow
- RefreshWorkflow
- Workflow Signal 与 Query

#### packages agents

- AgentRunner
- ModelProvider
- ContextBuilder
- ToolRegistry
- PromptRegistry
- ArtifactWriter
- EvidenceValidator
- RunEvaluator
- Agent Skill 实现

#### packages connectors

- WebSearchConnector
- BrowserConnector
- CompanyWebsiteConnector
- DocumentConnector
- TenderSearchConnector
- SocialPublicSearchConnector
- ContactVerificationConnector
- ObjectStorageConnector

#### packages evidence

- Source
- Snapshot
- Claim
- Evidence Item
- Contradiction
- Freshness
- Provenance

#### packages policies

- Tenant Policy
- Budget Policy
- Approval Policy
- Contact Data Policy
- Automation Policy

## 十二 数据库设计

### 12 1 通用约定

- 所有主键使用 uuid
- 所有业务表包含 tenant_id
- 所有时间使用 timestamptz
- 所有可更新表包含 created_at 与 updated_at
- 所有金额使用 numeric
- 所有枚举使用 PostgreSQL enum
- 所有 JSON 扩展字段使用 jsonb
- 所有业务查询通过 tenant_id 过滤
- 所有关键写入在同一事务中写入 domain_events 与 outbox_events

### 12 2 tenants

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| name | varchar 160 | required |
| slug | varchar 80 | unique |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

### 12 3 users

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| email | citext | unique required |
| display_name | varchar 120 | required |
| password_hash | text | required |
| created_at | timestamptz | required |
| last_login_at | timestamptz | nullable |

### 12 4 tenant_members

| 字段 | 类型 | 约束 |
|---|---|---|
| tenant_id | uuid | foreign key tenants |
| user_id | uuid | foreign key users |
| role | tenant_role | required |
| status | member_status | required |
| created_at | timestamptz | required |

复合主键

```text
tenant_id + user_id
```

### 12 5 missions

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| name | varchar 200 | required |
| company_name | varchar 200 | required |
| company_website | text | required |
| product_scope | text | required |
| target_countries | text array | required |
| target_industries | text array | required |
| target_profiles | jsonb | required |
| objective | text | required |
| success_definition | text | required |
| output_languages | text array | required |
| budget_config | jsonb | required |
| status | mission_status | required |
| current_stage | mission_stage | required |
| workflow_id | varchar 240 | nullable unique |
| created_by | uuid | required |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |
| completed_at | timestamptz | nullable |

索引

- tenant_id + status
- tenant_id + updated_at desc
- target_countries 使用 gin
- target_industries 使用 gin

### 12 6 mission_sources

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| source_kind | source_kind | required |
| original_name | varchar 300 | nullable |
| url | text | nullable |
| object_key | text | nullable |
| mime_type | varchar 120 | nullable |
| content_hash | varchar 128 | nullable |
| uploaded_by | uuid | nullable |
| created_at | timestamptz | required |

### 12 7 sources

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| source_type | source_type | required |
| url | text | nullable |
| title | text | nullable |
| publisher | text | nullable |
| language | varchar 20 | nullable |
| country_code | varchar 2 | nullable |
| published_at | timestamptz | nullable |
| first_seen_at | timestamptz | required |
| last_fetched_at | timestamptz | required |
| latest_snapshot_id | uuid | nullable |
| metadata | jsonb | required default empty object |
| status | source_status | required |

唯一索引

```text
tenant_id + mission_id + normalized_url
```

### 12 8 source_snapshots

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| source_id | uuid | required |
| fetched_at | timestamptz | required |
| http_status | integer | nullable |
| content_hash | varchar 128 | required |
| object_key | text | required |
| extracted_text | text | nullable |
| extraction_metadata | jsonb | required |
| created_at | timestamptz | required |

唯一索引

```text
source_id + content_hash
```

### 12 9 document_chunks

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| source_snapshot_id | uuid | required |
| chunk_index | integer | required |
| content | text | required |
| token_count | integer | required |
| embedding | vector | nullable |
| metadata | jsonb | required |
| created_at | timestamptz | required |

索引

- source_snapshot_id + chunk_index
- embedding 向量索引

### 12 10 claims

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| subject_entity_id | uuid | nullable |
| claim_type | varchar 80 | required |
| statement | text | required |
| value_json | jsonb | required |
| status | claim_status | required |
| confidence | integer | range 0 to 100 |
| origin | claim_origin | required |
| impact_level | varchar 20 | required |
| artifact_version_id | uuid | nullable |
| valid_from | timestamptz | nullable |
| valid_until | timestamptz | nullable |
| created_by_user_id | uuid | nullable |
| created_by_agent_run_id | uuid | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

索引

- mission_id + claim_type
- subject_entity_id
- status

### 12 11 evidence_items

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| source_snapshot_id | uuid | required |
| excerpt | text | required |
| locator | jsonb | required |
| stance | evidence_stance | required |
| relevance | integer | range 0 to 100 |
| freshness | integer | range 0 to 100 |
| created_at | timestamptz | required |

### 12 12 claim_evidence_links

| 字段 | 类型 | 约束 |
|---|---|---|
| claim_id | uuid | required |
| evidence_item_id | uuid | required |
| weight | integer | range 0 to 100 |
| created_at | timestamptz | required |

复合主键

```text
claim_id + evidence_item_id
```

### 12 13 artifacts

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| opportunity_id | uuid | nullable |
| artifact_type | artifact_type | required |
| title | varchar 240 | required |
| current_version_id | uuid | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

### 12 14 artifact_versions

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| artifact_id | uuid | required |
| version_no | integer | required |
| status | artifact_version_status | required |
| payload | jsonb | required |
| summary | text | required |
| agent_run_id | uuid | nullable |
| created_by_user_id | uuid | nullable |
| accepted_by_user_id | uuid | nullable |
| created_at | timestamptz | required |
| accepted_at | timestamptz | nullable |

唯一索引

```text
artifact_id + version_no
```

### 12 15 entities

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| canonical_name | varchar 300 | required |
| entity_type | entity_type | required |
| website | text | nullable |
| country_code | varchar 2 | nullable |
| region | varchar 120 | nullable |
| city | varchar 120 | nullable |
| description | text | nullable |
| external_ids | jsonb | required |
| status | entity_status | required |
| merged_into_id | uuid | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

索引

- tenant_id + canonical_name
- website
- country_code
- entity_type

### 12 16 entity_aliases

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| entity_id | uuid | required |
| alias | varchar 300 | required |
| language | varchar 20 | nullable |
| source_id | uuid | nullable |
| created_at | timestamptz | required |

唯一索引

```text
entity_id + alias
```

### 12 17 mission_entities

| 字段 | 类型 | 约束 |
|---|---|---|
| mission_id | uuid | required |
| entity_id | uuid | required |
| market_roles | text array | required |
| relevance_score | integer | range 0 to 100 |
| discovery_reason | text | required |
| target_status | target_status | required |
| primary_route_id | uuid | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

复合主键

```text
mission_id + entity_id
```

### 12 18 entity_relationships

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| source_entity_id | uuid | required |
| target_entity_id | uuid | required |
| relationship_type | relationship_type | required |
| directionality | varchar 20 | required |
| confidence | integer | range 0 to 100 |
| claim_id | uuid | nullable |
| attributes | jsonb | required |
| valid_from | timestamptz | nullable |
| valid_until | timestamptz | nullable |
| status | relationship_status | required |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

索引

- mission_id + source_entity_id
- mission_id + target_entity_id
- relationship_type

### 12 19 stakeholder_roles

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| organization_id | uuid | required |
| person_id | uuid | nullable |
| role_type | stakeholder_role_type | required |
| title | varchar 240 | nullable |
| decision_influence | integer | range 0 to 100 |
| contact_priority | integer | range 1 to 10 |
| relevance_reason | text | required |
| confidence | integer | range 0 to 100 |
| claim_id | uuid | nullable |
| status | stakeholder_status | required |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

### 12 20 contact_points

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| organization_id | uuid | required |
| person_id | uuid | nullable |
| stakeholder_role_id | uuid | nullable |
| contact_type | contact_type | required |
| value | text | required |
| normalized_value | text | required |
| label | varchar 240 | nullable |
| is_public | boolean | required |
| source_id | uuid | required |
| source_locator | jsonb | required |
| verification_status | contact_verification_status | required |
| confidence | integer | range 0 to 100 |
| first_seen_at | timestamptz | required |
| last_verified_at | timestamptz | nullable |
| preferred_rank | integer | nullable |
| language | varchar 20 | nullable |
| timezone | varchar 80 | nullable |
| metadata | jsonb | required |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

唯一索引

```text
mission_id + contact_type + normalized_value
```

### 12 21 contact_verifications

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| contact_point_id | uuid | required |
| method | contact_verification_method | required |
| result | verification_result | required |
| score | integer | range 0 to 100 |
| details | jsonb | required |
| agent_run_id | uuid | nullable |
| verified_by_user_id | uuid | nullable |
| verified_at | timestamptz | required |

### 12 22 market_routes

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| route_type | market_route_type | required |
| title | varchar 240 | required |
| hypothesis | text | required |
| applicable_scenarios | jsonb | required |
| key_entity_types | text array | required |
| key_stakeholder_roles | text array | required |
| primary_channels | text array | required |
| capability_requirements | jsonb | required |
| evidence_summary | text | required |
| counter_evidence_summary | text | required |
| confidence | integer | range 0 to 100 |
| entry_difficulty | integer | range 0 to 100 |
| time_to_first_contact_days | integer | required |
| resource_intensity | integer | range 0 to 100 |
| rank | integer | required |
| status | route_status | required |
| artifact_version_id | uuid | required |
| decided_by_user_id | uuid | nullable |
| decided_at | timestamptz | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

### 12 23 competitor_profiles

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| entity_id | uuid | required |
| market_presence_summary | text | required |
| route_patterns | jsonb | required |
| local_channels | jsonb | required |
| exhibitions | jsonb | required |
| public_customers | jsonb | required |
| certifications | jsonb | required |
| service_network | jsonb | required |
| market_minimums | jsonb | required |
| opportunity_gaps | jsonb | required |
| confidence | integer | range 0 to 100 |
| artifact_version_id | uuid | required |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

### 12 24 industry_opinions

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| person_entity_id | uuid | nullable |
| organization_entity_id | uuid | nullable |
| source_id | uuid | required |
| topic | varchar 240 | required |
| position_summary | text | required |
| market_implication | text | required |
| credibility_score | integer | range 0 to 100 |
| commercial_interest | varchar 120 | nullable |
| contactable | boolean | required |
| artifact_version_id | uuid | required |
| created_at | timestamptz | required |

### 12 25 opportunities

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| organization_id | uuid | required |
| route_id | uuid | required |
| title | varchar 240 | required |
| hypothesis | text | required |
| status | opportunity_status | required |
| priority | priority | required |
| score | integer | range 0 to 100 |
| evidence_confidence | confidence_level | required |
| commercial_value_band | commercial_value_band | required |
| estimated_sales_hours | numeric | required |
| estimated_technical_hours | numeric | required |
| estimated_market_cost_points | numeric | required |
| resource_efficiency | numeric | required |
| next_action | text | required |
| owner_id | uuid | nullable |
| workflow_id | varchar 240 | nullable unique |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

索引

- mission_id + status
- mission_id + score desc
- organization_id

### 12 26 opportunity_stakeholders

| 字段 | 类型 | 约束 |
|---|---|---|
| opportunity_id | uuid | required |
| stakeholder_role_id | uuid | required |
| role_in_opportunity | varchar 120 | required |
| rank | integer | required |
| created_at | timestamptz | required |

复合主键

```text
opportunity_id + stakeholder_role_id
```

### 12 27 opportunity_contacts

| 字段 | 类型 | 约束 |
|---|---|---|
| opportunity_id | uuid | required |
| contact_point_id | uuid | required |
| usage_type | varchar 40 | required |
| rank | integer | required |
| created_at | timestamptz | required |

复合主键

```text
opportunity_id + contact_point_id
```

### 12 28 opportunity_scores

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| opportunity_id | uuid | required |
| version_no | integer | required |
| product_fit | integer | range 0 to 100 |
| route_fit | integer | range 0 to 100 |
| demand_signal | integer | range 0 to 100 |
| timing_signal | integer | range 0 to 100 |
| stakeholder_relevance | integer | range 0 to 100 |
| contactability | integer | range 0 to 100 |
| evidence_quality | integer | range 0 to 100 |
| strategic_value | integer | range 0 to 100 |
| base_score | numeric | required |
| final_score | integer | range 0 to 100 |
| rationale | jsonb | required |
| generated_by | varchar 40 | required |
| agent_run_id | uuid | nullable |
| created_at | timestamptz | required |

唯一索引

```text
opportunity_id + version_no
```

### 12 29 action_cards

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| opportunity_id | uuid | required |
| version_no | integer | required |
| status | action_card_status | required |
| target_stakeholder_role_id | uuid | required |
| primary_contact_point_id | uuid | required |
| backup_contact_point_id | uuid | nullable |
| channel | contact_type | required |
| objective | text | required |
| contact_reason | text | required |
| timing_reason | text | required |
| stakeholder_interest | text | required |
| value_hypothesis | text | required |
| email_subject | text | nullable |
| email_body | text | nullable |
| social_message | text | nullable |
| call_opening | text | nullable |
| contact_form_message | text | nullable |
| attachments_required | jsonb | required |
| follow_up_plan | jsonb | required |
| success_signals | jsonb | required |
| completion_signals | jsonb | required |
| owner_id | uuid | nullable |
| due_at | timestamptz | nullable |
| approved_by | uuid | nullable |
| approved_at | timestamptz | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

唯一索引

```text
opportunity_id + version_no
```

### 12 30 interactions

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| opportunity_id | uuid | required |
| action_card_id | uuid | nullable |
| interaction_type | interaction_type | required |
| occurred_at | timestamptz | required |
| actor_user_id | uuid | required |
| target_contact_point_id | uuid | nullable |
| channel | varchar 80 | nullable |
| summary | text | required |
| raw_content_object_key | text | nullable |
| outcome | varchar 120 | required |
| new_facts | jsonb | required |
| next_action | text | nullable |
| follow_up_at | timestamptz | nullable |
| created_at | timestamptz | required |

### 12 31 approvals

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| opportunity_id | uuid | nullable |
| artifact_version_id | uuid | nullable |
| action_card_id | uuid | nullable |
| approval_type | approval_type | required |
| status | approval_status | required |
| requested_by | uuid | nullable |
| requested_at | timestamptz | required |
| decided_by | uuid | nullable |
| decided_at | timestamptz | nullable |
| comment | text | nullable |

### 12 32 domain_events

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| aggregate_type | varchar 80 | required |
| aggregate_id | uuid | required |
| event_type | varchar 160 | required |
| event_version | integer | required |
| payload | jsonb | required |
| actor_type | varchar 40 | required |
| actor_id | varchar 240 | nullable |
| correlation_id | uuid | required |
| causation_id | uuid | nullable |
| occurred_at | timestamptz | required |

索引

- tenant_id + occurred_at desc
- aggregate_type + aggregate_id
- event_type

### 12 33 outbox_events

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| domain_event_id | uuid | required unique |
| status | outbox_status | required |
| attempts | integer | required |
| next_attempt_at | timestamptz | required |
| published_at | timestamptz | nullable |
| last_error | text | nullable |
| created_at | timestamptz | required |

### 12 34 agent_runs

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| opportunity_id | uuid | nullable |
| activity_type | varchar 120 | required |
| skill_key | varchar 120 | required |
| status | run_status | required |
| model_provider | varchar 80 | required |
| model_name | varchar 120 | required |
| prompt_version_id | uuid | required |
| input_artifact_ids | uuid array | required |
| output_artifact_version_ids | uuid array | required |
| input_tokens | integer | required |
| output_tokens | integer | required |
| cost_amount | numeric | required |
| trace_id | varchar 160 | nullable |
| started_at | timestamptz | required |
| completed_at | timestamptz | nullable |
| error_code | varchar 120 | nullable |
| error_message | text | nullable |

### 12 35 tool_runs

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| agent_run_id | uuid | required |
| connector_type | varchar 120 | required |
| operation | varchar 120 | required |
| status | run_status | required |
| request_summary | jsonb | required |
| response_summary | jsonb | required |
| source_ids | uuid array | required |
| duration_ms | integer | required |
| cost_amount | numeric | required |
| started_at | timestamptz | required |
| completed_at | timestamptz | nullable |
| error_message | text | nullable |

### 12 36 workflow_instances

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| tenant_id | uuid | required |
| mission_id | uuid | required |
| opportunity_id | uuid | nullable |
| workflow_type | varchar 120 | required |
| workflow_id | varchar 240 | required unique |
| run_id | varchar 240 | required |
| status | workflow_status | required |
| started_at | timestamptz | required |
| updated_at | timestamptz | required |
| closed_at | timestamptz | nullable |

### 12 37 prompt_versions

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | primary key |
| skill_key | varchar 120 | required |
| version | integer | required |
| system_template | text | required |
| input_schema_version | integer | required |
| output_schema_version | integer | required |
| model_config | jsonb | required |
| active | boolean | required |
| created_at | timestamptz | required |

唯一索引

```text
skill_key + version
```


### 12 38 Read Models

Projector 根据 Domain Event 更新以下读取模型

#### mission_dashboard_read_model

字段

- tenant_id
- mission_id
- mission_name
- company_name
- target_countries
- status
- current_stage
- approved_route_count
- target_count
- verified_contact_count
- action_card_count
- pending_approval_count
- high_priority_opportunity_count
- weekly_interaction_count
- total_cost_amount
- updated_at

#### mission_progress_read_model

字段

- mission_id
- stage
- stage_progress
- completed_steps
- running_steps
- pending_steps
- failed_steps
- active_child_workflows
- budget_usage
- pending_user_actions
- updated_at

#### target_list_read_model

字段

- mission_id
- entity_id
- organization_name
- website
- country_code
- market_roles
- primary_route_title
- product_fit
- demand_signal
- contactability
- evidence_quality
- final_score
- target_status
- opportunity_id
- updated_at

#### contact_path_read_model

字段

- mission_id
- contact_point_id
- organization_id
- organization_name
- stakeholder_role_id
- stakeholder_role_type
- person_name
- person_title
- contact_type
- value
- source_title
- source_url
- verification_status
- verification_score
- last_verified_at
- preferred_rank
- usage_status
- updated_at

#### opportunity_board_read_model

字段

- mission_id
- opportunity_id
- organization_name
- route_title
- status
- priority
- score
- commercial_value_band
- resource_efficiency
- primary_contact_summary
- next_action
- owner_name
- updated_at

#### action_queue_read_model

字段

- mission_id
- action_card_id
- opportunity_id
- organization_name
- stakeholder_summary
- primary_contact_summary
- status
- channel
- objective
- owner_name
- due_at
- updated_at

#### timeline_read_model

字段

- tenant_id
- mission_id
- event_id
- event_type
- actor_type
- actor_display_name
- aggregate_type
- aggregate_id
- title
- summary
- evidence_refs
- occurred_at

#### run_read_model

字段

- mission_id
- run_id
- run_type
- skill_key
- status
- model_name
- input_tokens
- output_tokens
- cost_amount
- duration_ms
- trace_id
- started_at
- completed_at
- error_message

Projector 消费规则

- 每个 outbox_event 只投影一次
- 读取模型更新使用 event_id 作为幂等键
- Projector 完成投影后更新 outbox_events 为 published
- SSE 事件在读取模型事务提交后发送
- 前端断线重连时使用 Last Event ID 继续订阅

### 12 39 PostgreSQL Enum

```text
tenant_role
owner
editor
viewer

member_status
active
invited
suspended

mission_status
draft
running
paused
completed
failed
archived

mission_stage
draft
compiling
ingesting_company_data
researching_routes
awaiting_route_review
researching_ecosystem
researching_targets
researching_contacts
generating_actions
active
awaiting_budget_review
completed
failed

source_kind
website
uploaded_file
manual_url
interaction_attachment

source_type
company_website
product_page
case_study
certification_page
contact_page
search_result
tender_notice
award_notice
registry_record
association_page
exhibition_page
social_public_page
industry_article
expert_content
interaction_record
uploaded_document

source_status
active
stale
unavailable
superseded

claim_status
observed
inferred
user_confirmed
contradicted
unknown
superseded

claim_origin
agent
user
rule
import
interaction

artifact_type
mission_brief
capability_ledger
market_route_set
competitor_set
expert_signal_set
ecosystem_map
target_ranking
stakeholder_map
contact_path_set
opportunity_qualification
action_card
refresh_proposal
interaction_interpretation

artifact_version_status
proposed
accepted
changes_requested
rejected
superseded

entity_type
organization
person
project
exhibition
association
government_body
industry_event

entity_status
active
merged
archived

relationship_status
proposed
confirmed
superseded

stakeholder_status
proposed
confirmed
stale
archived

target_status
observed
target
high_priority
archived

contact_verification_status
discovered
format_valid
source_confirmed
cross_confirmed
manually_confirmed
stale
invalid

contact_verification_method
format
mx
url_access
official_source
source_cross_check
employment_check
manual
interaction

verification_result
passed
partial
failed

route_status
proposed
approved
deprioritized
superseded

opportunity_status
observed
target_identified
stakeholder_mapped
contact_path_found
contact_path_verified
action_ready
approved
contacted
responded
qualified
meeting
supplier_registration
sample
quotation
won
paused
archived
lost

priority
low
medium
high
critical

action_card_status
draft
review
approved
changes_requested
exported
executed
completed
cancelled

interaction_type
email_sent
message_sent
call
meeting
form_submitted
supplier_registration
exhibition_meeting
referral
response
qualification_update
sample_sent
quotation_sent

approval_type
mission_brief
market_route
action_card
refresh_proposal
budget_review

approval_status
pending
approved
changes_requested
rejected

run_status
queued
running
succeeded
failed
cancelled

workflow_status
running
paused
completed
failed
terminated

outbox_status
pending
processing
published
failed

confidence_level
low
medium
high

commercial_value_band
very_low
low
medium
high
strategic

evidence_stance
support
oppose
context
```

### 12 40 数据新鲜度策略

| 数据类型 | 默认有效期 | 到期动作 |
|---|---:|---|
| 个人任职信息 | 90 天 | 进入重新确认队列 |
| 个人直接联系方式 | 90 天 | 进入重新验证队列 |
| 部门邮箱与联系表单 | 180 天 | 检查页面可访问性 |
| 采购门户与供应商入口 | 180 天 | 检查页面与流程变化 |
| 企业官网业务描述 | 180 天 | 比较页面内容哈希 |
| 竞争对手渠道网络 | 180 天 | 重新搜索区域页面与代理商页面 |
| 市场路线证据 | 180 天 | 重新评估路线置信度 |
| 行业观点 | 365 天 | 保留历史观点并获取新观点 |
| 展会信息 | 活动结束日 | 更新为历史事件并创建展后跟进任务 |
| 招标信息 | 截止日 | 更新状态并搜索中标结果 |

### 12 41 实体消歧规则

实体消歧按以下顺序执行

1 标准化名称，移除公司法律后缀并保留原始别名

2 比较官方域名

3 比较企业注册编号与公开外部编号

4 比较国家，城市与地址

5 比较官方社交主页

6 比较品牌别名与产品范围

7 计算名称相似度

决策阈值

| 条件 | 决策 |
|---|---|
| 官方域名完全一致 | merge |
| 注册编号完全一致 | merge |
| 名称相似度达到 90 且国家一致 | merge |
| 名称相似度 70 至 89 | link 并创建人工复核项 |
| 名称相似度低于 70 | create |

每次 merge 保存

- 原实体
- 目标实体
- 匹配依据
- 证据
- 操作人或 Agent Run
- 时间

### 12 42 依赖失效与重新计算

| 上游变化 | 自动标记的下游对象 | 自动任务 |
|---|---|---|
| 高影响 Capability Claim 变化 | 相关 Market Route，Opportunity，Action Card | 重新评分并生成变化提案 |
| Market Route 获得批准 | Target Ranking，Ecosystem Research | 启动下一阶段研究 |
| Market Route 优先级变化 | Target Ranking，Opportunity Score | 重新排序 |
| Entity 合并 | Stakeholder，Contact Point，Opportunity | 迁移关系并去重 |
| Stakeholder 变化 | Contact Path，Action Card | 重新选择联系对象 |
| Primary Contact 进入 stale | Opportunity，Action Card | 寻找替代路径并生成新版本 |
| Contact Point 确认有效 | Opportunity Score | 更新 contactability |
| Interaction 新事实 | Claim，Route，Contact，Opportunity | 解释互动并更新下一步动作 |
| Competition Profile 变化 | Route，Value Hypothesis | 更新进入方式与行动卡价值主张 |
| 用户锁定结论 | 所有依赖对象 | 使用锁定版本作为当前事实 |

## 十三 Agent Skill 合同

### 13 1 通用 Agent 输入

```ts
export interface AgentTaskInput {
  tenantId: string
  missionId: string
  opportunityId?: string
  skillKey: string
  objective: string
  artifactRefs: Array<{
    artifactId: string
    versionId: string
    type: string
  }>
  knownClaims: Array<{
    claimId: string
    statement: string
    status: string
    confidence: number
    evidenceRefs: string[]
  }>
  openQuestions: string[]
  toolPermissions: string[]
  budget: {
    maxSearchCalls: number
    maxBrowserPages: number
    maxModelTokens: number
  }
  outputLanguage: string
}
```

### 13 2 通用 Agent 输出

```ts
export interface AgentTaskOutput<T> {
  result: T
  proposedClaims: Array<{
    claimType: string
    statement: string
    value: unknown
    confidence: number
    evidenceRefs: string[]
    impactLevel: string
  }>
  unknowns: Array<{
    question: string
    impact: string
    recommendedTask?: string
  }>
  contradictions: Array<{
    claimRef?: string
    description: string
    evidenceRefs: string[]
  }>
  recommendedEvents: Array<{
    eventType: string
    payload: Record<string, unknown>
  }>
  quality: {
    schemaValid: boolean
    evidenceCoverage: number
    confidence: number
  }
}
```

### 13 3 Mission Compiler

Skill Key

```text
mission_compiler
```

输入

- 用户表单
- 用户上传资料元数据
- 企业官网

输出

```ts
export interface MissionBrief {
  company: {
    name: string
    website: string
    productSummary: string
  }
  markets: Array<{
    countryCode: string
    countryName: string
    targetIndustries: string[]
    outputLanguages: string[]
  }>
  targetProfiles: Array<{
    type: string
    description: string
  }>
  objectives: string[]
  successCriteria: string[]
  knownFacts: string[]
  initialAssumptions: Array<{
    statement: string
    confidence: number
  }>
  openQuestions: string[]
  budget: {
    maxTargets: number
    maxContactPaths: number
    maxSearchCalls: number
    maxBrowserPages: number
    maxAgentRuns: number
  }
}
```

质量门

- 企业名称存在
- 企业官网存在
- 产品范围存在
- 至少一个目标国家
- 至少一个成功标准
- 预算字段完整

### 13 4 Capability Evidence Extractor

Skill Key

```text
capability_evidence_extractor
```

输出

```ts
export interface CapabilityExtractionResult {
  claims: Array<{
    category: string
    statement: string
    status: 'observed' | 'inferred' | 'unknown'
    confidence: number
    evidenceRefs: string[]
    currentMissionImpact: 'low' | 'medium' | 'high'
  }>
  missingCapabilities: Array<{
    capability: string
    routeDependency: string
    questionForUser: string
  }>
}
```

### 13 5 Market Route Researcher

Skill Key

```text
market_route_researcher
```

输出

```ts
export interface MarketRouteResearchResult {
  routes: Array<{
    routeType: string
    title: string
    hypothesis: string
    applicableScenarios: string[]
    keyEntityTypes: string[]
    keyStakeholderRoles: string[]
    primaryChannels: string[]
    capabilityRequirements: string[]
    supportingEvidenceRefs: string[]
    counterEvidenceRefs: string[]
    confidence: number
    entryDifficulty: number
    timeToFirstContactDays: number
    resourceIntensity: number
    rank: number
  }>
}
```

质量门

- 产出至少三条路线
- 每条路线至少两条证据
- 每条路线包含关键组织类型
- 每条路线包含主要联系渠道
- 每条路线包含企业能力要求

### 13 6 Competitor Researcher

Skill Key

```text
competitor_researcher
```

输出

```ts
export interface CompetitorResearchResult {
  competitors: Array<{
    entityCandidate: EntityCandidate
    marketPresenceSummary: string
    routePatterns: string[]
    localChannels: EntityCandidate[]
    exhibitions: EntityCandidate[]
    publicCustomers: EntityCandidate[]
    certifications: string[]
    serviceNetwork: string[]
    marketMinimums: string[]
    opportunityGaps: string[]
    evidenceRefs: string[]
    confidence: number
  }>
}
```

### 13 7 Expert Signal Researcher

Skill Key

```text
expert_signal_researcher
```

输出

```ts
export interface ExpertSignalResearchResult {
  opinions: Array<{
    person?: EntityCandidate
    organization?: EntityCandidate
    topic: string
    positionSummary: string
    marketImplication: string
    credibilityScore: number
    commercialInterest?: string
    contactable: boolean
    evidenceRefs: string[]
  }>
}
```

### 13 8 Ecosystem Mapper

Skill Key

```text
ecosystem_mapper
```

输出

```ts
export interface EntityCandidate {
  canonicalName: string
  entityType: string
  website?: string
  countryCode?: string
  region?: string
  city?: string
  aliases: string[]
  externalIds: Record<string, string>
  description?: string
  evidenceRefs: string[]
  confidence: number
}

export interface EcosystemMapResult {
  entities: EntityCandidate[]
  relationships: Array<{
    sourceCandidateKey: string
    targetCandidateKey: string
    relationshipType: string
    confidence: number
    evidenceRefs: string[]
  }>
}
```

### 13 9 Entity Resolver

Skill Key

```text
entity_resolver
```

输入

- Entity Candidate
- 数据库相似实体
- 官方域名
- 地址
- 外部编号

输出

```ts
export interface EntityResolutionResult {
  decision: 'create' | 'merge' | 'link'
  matchedEntityId?: string
  canonicalName: string
  confidence: number
  reasons: string[]
  evidenceRefs: string[]
}
```

### 13 10 Stakeholder Mapper

Skill Key

```text
stakeholder_mapper
```

输出

```ts
export interface StakeholderMapResult {
  stakeholders: Array<{
    organizationId: string
    personCandidate?: EntityCandidate
    roleType: string
    title?: string
    decisionInfluence: number
    contactPriority: number
    relevanceReason: string
    evidenceRefs: string[]
    confidence: number
  }>
}
```

### 13 11 Contact Path Finder

Skill Key

```text
contact_path_finder
```

输出

```ts
export interface ContactPathResult {
  contactPoints: Array<{
    organizationId: string
    personId?: string
    stakeholderRoleId?: string
    contactType: string
    value: string
    label?: string
    isPublic: boolean
    sourceRef: string
    sourceLocator: Record<string, unknown>
    confidence: number
    language?: string
    timezone?: string
    recommendedRank: number
    backupPathDescription?: string
  }>
}
```

质量门

- 每条联系方式具有来源
- 每条联系方式关联组织
- 主要路径关联利益角色
- 高优先级目标具有主要路径与备用路径

### 13 12 Opportunity Qualifier

Skill Key

```text
opportunity_qualifier
```

输出

```ts
export interface OpportunityQualificationResult {
  hypothesis: string
  recommendedStatus: string
  commercialValueBand: string
  estimatedSalesHours: number
  estimatedTechnicalHours: number
  estimatedMarketCostPoints: number
  scores: {
    productFit: number
    routeFit: number
    demandSignal: number
    timingSignal: number
    stakeholderRelevance: number
    contactability: number
    evidenceQuality: number
    strategicValue: number
  }
  rationale: Record<string, string>
  nextAction: string
  evidenceRefs: string[]
  unknowns: string[]
}
```

### 13 13 Action Card Builder

Skill Key

```text
action_card_builder
```

输出

```ts
export interface ActionCardResult {
  targetStakeholderRoleId: string
  primaryContactPointId: string
  backupContactPointId?: string
  channel: string
  objective: string
  contactReason: string
  timingReason: string
  stakeholderInterest: string
  valueHypothesis: string
  emailSubject?: string
  emailBody?: string
  socialMessage?: string
  callOpening?: string
  contactFormMessage?: string
  attachmentsRequired: string[]
  followUpPlan: Array<{
    offsetDays: number
    channel: string
    objective: string
  }>
  successSignals: string[]
  completionSignals: string[]
  evidenceRefs: string[]
}
```

### 13 14 Interaction Interpreter

Skill Key

```text
interaction_interpreter
```

输出

```ts
export interface InteractionInterpretationResult {
  extractedClaims: Array<{
    claimType: string
    statement: string
    confidence: number
  }>
  contactUpdates: Array<{
    contactPointId: string
    verificationStatus: string
    reason: string
  }>
  routeUpdates: Array<{
    routeId: string
    confidenceDelta: number
    reason: string
  }>
  recommendedOpportunityStatus: string
  nextAction: string
  actionCardRegenerationRequired: boolean
}
```


### 13 15 Agent 执行协议

每次 Agent Skill 运行采用以下固定阶段

```text
加载当前有效产物
    ↓
加载相关 Claims 与 Evidence
    ↓
加载待解决问题
    ↓
生成研究计划
    ↓
调用已授权 Connector
    ↓
保存 Source 与 Snapshot
    ↓
提取支持证据与反向证据
    ↓
评估证据覆盖率
    ↓
生成结构化输出
    ↓
执行 Schema 校验
    ↓
执行 Evidence 校验
    ↓
写入 Artifact Version Proposal
```

默认研究循环上限

| Skill 类型 | 最大循环次数 |
|---|---:|
| Mission Compiler | 1 |
| Capability Extractor | 2 |
| Market Route Researcher | 4 |
| Competitor Researcher | 4 |
| Expert Signal Researcher | 3 |
| Ecosystem Mapper | 4 |
| Stakeholder Mapper | 3 |
| Contact Path Finder | 4 |
| Opportunity Qualifier | 2 |
| Action Card Builder | 2 |
| Interaction Interpreter | 2 |

每轮研究状态包含

- 已解决问题
- 待解决问题
- 已使用搜索请求数
- 已抓取页面数
- 已发现来源数
- 已产生 Claim 数
- 当前证据覆盖率
- 剩余预算

结束条件

- 输出 Schema 完整
- 核心字段证据覆盖率达到质量门
- 待解决问题均有结论或 Unknown 记录
- 当前 Skill 预算使用完成
- 本轮新增证据低于继续研究阈值

### 13 16 Context Builder

Context Builder 按 Skill 加载精确上下文

通用上下文

- 当前 Mission Brief
- 当前预算
- 输出语言
- 用户锁定的 Claims
- 当前有效 Artifact Versions
- 当前待解决问题

Market Route Researcher 追加

- 企业能力 Claims
- 目标国家基础信息
- 已知竞争对手
- 用户已知渠道与客户

Ecosystem Mapper 追加

- approved Market Routes
- Competitor Profiles
- Industry Opinions
- 已发现 Entities 与 Relationships

Contact Path Finder 追加

- 目标组织
- Stakeholder Roles
- approved Route 的主要联系渠道
- 已有 Contact Points
- Contact Freshness

Action Card Builder 追加

- Opportunity Qualification
- 主要与备用 Contact Point
- Stakeholder Interest
- Competitor Gaps
- 企业已确认能力
- 当前未知项

Context Builder 返回的文本内容按以下顺序组织

```text
任务目标
业务定义
当前事实
当前推断
当前未知项
当前证据
当前产物
本轮目标
工具权限
预算
输出 Schema
```

### 13 17 Prompt Registry

每个 Skill 使用版本化 Prompt

Prompt 由以下片段组合

- Skill Role
- Business Objective
- Domain Definitions
- Evidence Protocol
- Tool Usage Protocol
- Quality Criteria
- Output Language
- Output Schema

Prompt Version 变更流程

1 创建新版本

2 使用固定 Eval Dataset 运行评估

3 记录 Schema 通过率与证据覆盖率

4 将通过评估的版本设置为 active

5 新 Agent Run 使用 active 版本

6 历史 Agent Run 保留原 Prompt Version ID

### 13 18 Evidence Validator

Evidence Validator 执行以下校验

- evidenceRefs 均指向当前 Tenant 与 Mission
- Evidence Item 对应有效 Source Snapshot
- Claim Statement 与 Evidence Excerpt 具有语义关联
- 高影响 Claim 至少具有一条 support Evidence
- Route 关键结论至少具有两条独立来源
- Contact Point 具有直接来源位置
- Action Card 的联系理由可追溯到 Claim 或 Opportunity Qualification
- Unknown 字段具有业务影响说明

Evidence Coverage 计算

```text
evidence_coverage =
具有证据引用的必填结论数量 ÷
全部必填结论数量 × 100
```

### 13 19 Research Query Planner

Query Planner 将业务问题拆分为多语言搜索任务

每个搜索任务包含

- 业务问题
- 目标实体类型
- 目标国家
- 查询语言
- 查询字符串
- 预期来源类型
- 优先级
- 最大结果数

市场路线查询模板

```text
{country} {industry} distributor procurement model
{country} {product} supplier registration
{country} {industry} EPC contractors
{country} {product} tender award
{country} {industry} trade association
{country} {industry} exhibition exhibitors
```

组织与利益角色查询模板

```text
site:{organizationDomain} procurement
site:{organizationDomain} supplier registration
site:{organizationDomain} purchasing manager
site:{organizationDomain} engineering team
site:{organizationDomain} contact
{organizationName} procurement director
{organizationName} project engineer
{organizationName} distributor application
```

竞争对手查询模板

```text
{competitorName} {country} distributor
{competitorName} {country} office
{competitorName} {country} exhibition
{competitorName} {country} project
{competitorName} {country} partner
```

专家观点查询模板

```text
{country} {industry} market expert interview
{country} {industry} procurement challenges
{country} {industry} distributor perspective
{country} {industry} conference speaker
```

Query Planner 根据目标国家生成当地语言版本

### 13 20 Artifact Writer

Artifact Writer 采用统一事务

1 创建 Artifact 或读取现有 Artifact

2 计算下一 version_no

3 写入 artifact_versions proposed

4 写入 proposed Claims 与 Evidence Links

5 写入相关业务对象 Proposal

6 写入 domain_event

7 写入 outbox_event

8 提交事务

Artifact 被用户批准后执行

1 当前 accepted Version 更新为 superseded

2 目标 Version 更新为 accepted

3 artifacts current_version_id 指向目标 Version

4 写入 approval

5 写入 domain_event

6 写入 outbox_event

## 十四 Temporal Workflow 设计

### 14 1 MissionWorkflow

Workflow ID

```text
mission:{missionId}
```

输入

```ts
interface MissionWorkflowInput {
  tenantId: string
  missionId: string
}
```

Workflow 步骤

1 读取任务配置

2 执行 compileMission Activity

3 写入 mission_brief Artifact Version

4 执行 ingestCompanySources Activity

5 并行执行

- extractCapabilityClaims
- researchMarketRoutes
- researchCompetitors
- researchExpertSignals

6 写入对应 Artifact Versions

7 将 Mission 更新为 awaiting_route_review

8 等待 routeReviewSubmitted Signal

9 读取已批准路线

10 按路线并行执行 discoverEcosystem

11 执行 resolveEntities

12 执行 rankTargets

13 选取前 N 个目标组织

14 为每个目标组织启动 OpportunityWorkflow Child Workflow

15 等待所有 OpportunityWorkflow 进入 action_ready 或已结束状态

16 将 Mission 更新为 active

17 创建每周 Refresh Schedule

18 持续接收 Mission Signal

Signals

```ts
routeReviewSubmitted
missionPaused
missionResumed
manualRefreshRequested
budgetUpdated
missionCompleted
```

Queries

```ts
getMissionProgress
getBudgetUsage
getPendingApprovals
getChildOpportunityStatuses
```

Continue As New 条件

- Workflow History 超过一万事件
- 运行时间超过三十天
- 每周刷新累计超过四次

### 14 2 OpportunityWorkflow

Workflow ID

```text
opportunity:{opportunityId}
```

步骤

1 读取机会与组织

2 执行 resolveEntity

3 执行 mapStakeholders

4 执行 findContactPaths

5 并行执行 verifyContactPoint

6 执行 qualifyOpportunity

7 写入 Opportunity Score

8 满足质量门后执行 buildActionCard

9 创建 Action Card review 状态

10 等待 actionCardDecision Signal

11 批准后更新 Opportunity 为 approved

12 等待 interactionRecorded Signal

13 收到互动后执行 interpretInteraction

14 更新 Claims，Contacts，Routes 与 Opportunity

15 根据新状态生成新的 Action Card Version

16 达到终止状态后关闭 Workflow

Signals

```ts
actionCardDecision
interactionRecorded
opportunityPaused
opportunityResumed
manualResearchRequested
priorityChanged
```

Queries

```ts
getOpportunityProgress
getCurrentActionCard
getPendingUnknowns
getCurrentScore
```

### 14 3 RefreshWorkflow

Workflow ID

```text
refresh:{missionId}:{scheduledAt}
```

步骤

1 读取刷新配置

2 获取前 N 个高优先级机会

3 获取三十天以上未验证的联系方式

4 获取关键路线来源

5 获取主要竞争对手

6 并行执行来源刷新

7 比较 Source Snapshot Hash

8 对变化来源执行信息提取

9 生成 Refresh Proposal Artifact

10 创建 Refresh Review Approval

11 发送 mission refresh completed 领域事件

## 十五 Activity 设计

### 15 1 Activity 通用规则

- Activity 输入只包含标识符与结构化参数
- Activity 从数据库读取业务上下文
- Activity 输出写入数据库后返回结果标识符
- 所有 Activity 使用 idempotency_key
- 所有外部调用写入 tool_runs
- 所有 Agent 调用写入 agent_runs
- 所有产生业务变化的 Activity 写入 domain_events 与 outbox_events

### 15 2 超时与重试

| Activity 类型 | Start To Close | 最大尝试次数 | 退避 |
|---|---:|---:|---|
| 数据库写入 | 30 秒 | 5 | 指数退避 |
| Web Search | 60 秒 | 3 | 指数退避 |
| Browser Fetch | 120 秒 | 3 | 指数退避 |
| Document Parse | 300 秒 | 2 | 固定退避 |
| Agent Run | 180 秒 | 3 | 指数退避 |
| Contact Verify | 60 秒 | 3 | 指数退避 |
| Export | 120 秒 | 2 | 固定退避 |

### 15 3 Task Queue

```text
mission-orchestration
agent-research
web-search
browser-fetch
entity-resolution
contact-discovery
contact-verification
artifact-write
refresh
```

默认并发

| Queue | 并发 |
|---|---:|
| mission-orchestration | 10 |
| agent-research | 4 |
| web-search | 5 |
| browser-fetch | 3 |
| entity-resolution | 5 |
| contact-discovery | 4 |
| contact-verification | 8 |
| artifact-write | 10 |
| refresh | 2 |

## 十六 Connector 设计

### 16 1 通用接口

```ts
export interface ConnectorRequest {
  tenantId: string
  missionId: string
  operation: string
  query?: string
  url?: string
  locale?: string
  countryCode?: string
  options?: Record<string, unknown>
}

export interface ConnectorResult {
  success: boolean
  items: Array<{
    title?: string
    url?: string
    content?: string
    metadata: Record<string, unknown>
  }>
  rawObjectKey?: string
  costAmount: number
  durationMs: number
}
```

### 16 2 WebSearchConnector

实现

- Tavily Provider
- Mock Provider

操作

- search
- search_news
- search_domain
- search_people
- search_tenders
- search_exhibitions

返回字段

- title
- url
- snippet
- published_at
- domain
- score
- query

### 16 3 BrowserConnector

实现

- Direct Fetch
- Playwright Fallback
- Mock Provider

操作

- fetch_page
- fetch_rendered_page
- extract_links
- capture_snapshot
- fetch_file

保存

- 原始 HTML
- 页面截图
- 提取文本
- 页面标题
- 元数据
- 内容哈希

### 16 4 CompanyWebsiteConnector

操作

- discover_sitemap
- discover_product_pages
- discover_case_pages
- discover_certification_pages
- discover_contact_pages
- crawl_selected_pages

### 16 5 DocumentConnector

操作

- parse_pdf
- parse_docx
- parse_xlsx
- parse_pptx
- split_chunks
- generate_embeddings

### 16 6 TenderSearchConnector

V1 实现方式

- 使用 WebSearchConnector 生成国家语言查询
- 识别招标公告，中标公告，供应商注册，项目审批与政府采购页面
- 保存原始页面与结构化字段

结构化字段

- title
- buyer
- agency
- country
- industry
- published_at
- deadline_at
- project_value
- contact_text
- supplier_requirements
- source_url

### 16 7 SocialPublicSearchConnector

V1 数据范围

- 搜索引擎公开索引的职业资料
- 企业官方社交页面
- 公开行业社区页面
- 用户提供页面

结构化字段

- person_name
- organization
- title
- profile_url
- platform
- last_seen_signal
- public_contact_text
- source_url

### 16 8 ContactVerificationConnector

操作

- normalize
- validate_email_format
- validate_mx
- validate_url
- cross_check_sources
- manual_confirm

验证分数

| 验证方式 | 加分 |
|---|---:|
| 官方网站直接展示 | 40 |
| 官方采购或供应商页面 | 40 |
| 多个独立来源一致 | 25 |
| 邮箱格式有效 | 10 |
| 邮箱域名 MX 有效 | 15 |
| 人员任职近期确认 | 20 |
| 用户手动确认 | 50 |

最终分数上限为 100

状态映射

| 分数 | 状态 |
|---|---|
| 0 至 29 | discovered |
| 30 至 49 | format_valid |
| 50 至 69 | source_confirmed |
| 70 至 89 | cross_confirmed |
| 90 至 100 | manually_confirmed |

## 十七 API 设计

### 17 1 通用响应

```ts
interface ApiResponse<T> {
  data: T
  meta: {
    requestId: string
    timestamp: string
  }
}
```

分页响应

```ts
interface PaginatedResponse<T> {
  data: T[]
  meta: {
    requestId: string
    timestamp: string
    page: number
    pageSize: number
    total: number
  }
}
```

### 17 2 Auth

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### 17 3 Workspace

```text
GET   /api/v1/workspace
PATCH /api/v1/workspace
GET   /api/v1/workspace/members
POST  /api/v1/workspace/members
PATCH /api/v1/workspace/members/:memberId
```

### 17 4 Missions

```text
POST   /api/v1/missions
GET    /api/v1/missions
GET    /api/v1/missions/:missionId
PATCH  /api/v1/missions/:missionId
POST   /api/v1/missions/:missionId/start
POST   /api/v1/missions/:missionId/pause
POST   /api/v1/missions/:missionId/resume
POST   /api/v1/missions/:missionId/refresh
POST   /api/v1/missions/:missionId/complete
GET    /api/v1/missions/:missionId/progress
GET    /api/v1/missions/:missionId/metrics
GET    /api/v1/missions/:missionId/stream
```

创建 Mission 请求

```ts
interface CreateMissionRequest {
  name: string
  companyName: string
  companyWebsite: string
  productScope: string
  targetCountries: string[]
  targetIndustries: string[]
  targetProfiles: Array<{
    type: string
    description: string
  }>
  objective: string
  successDefinition: string
  outputLanguages: string[]
  budgetConfig: {
    maxTargets: number
    maxContactPaths: number
    maxSearchCalls: number
    maxBrowserPages: number
    maxAgentRuns: number
    weeklyRefreshTargets: number
  }
}
```

### 17 5 Mission Sources

```text
POST /api/v1/missions/:missionId/sources/upload
POST /api/v1/missions/:missionId/sources/url
GET  /api/v1/missions/:missionId/sources
GET  /api/v1/missions/:missionId/sources/:sourceId
GET  /api/v1/missions/:missionId/sources/:sourceId/snapshots
```

### 17 6 Capability Ledger

```text
GET   /api/v1/missions/:missionId/capabilities
PATCH /api/v1/missions/:missionId/capabilities/:claimId
POST  /api/v1/missions/:missionId/capabilities/:claimId/confirm
POST  /api/v1/missions/:missionId/capabilities/:claimId/contradict
POST  /api/v1/missions/:missionId/capabilities/research
```

### 17 7 Routes

```text
GET   /api/v1/missions/:missionId/routes
GET   /api/v1/missions/:missionId/routes/:routeId
PATCH /api/v1/missions/:missionId/routes/:routeId
POST  /api/v1/missions/:missionId/routes/:routeId/approve
POST  /api/v1/missions/:missionId/routes/:routeId/deprioritize
POST  /api/v1/missions/:missionId/routes/:routeId/research
POST  /api/v1/missions/:missionId/routes/review-complete
```

### 17 8 Ecosystem

```text
GET  /api/v1/missions/:missionId/entities
GET  /api/v1/missions/:missionId/entities/:entityId
GET  /api/v1/missions/:missionId/relationships
GET  /api/v1/missions/:missionId/graph
POST /api/v1/missions/:missionId/entities/:entityId/promote
POST /api/v1/missions/:missionId/entities/:entityId/archive
POST /api/v1/missions/:missionId/entities/:entityId/research
```

### 17 9 Targets

```text
GET   /api/v1/missions/:missionId/targets
PATCH /api/v1/missions/:missionId/targets/:entityId
POST  /api/v1/missions/:missionId/targets/:entityId/create-opportunity
POST  /api/v1/missions/:missionId/targets/batch-create-opportunities
```

### 17 10 Stakeholders

```text
GET   /api/v1/missions/:missionId/entities/:entityId/stakeholders
POST  /api/v1/missions/:missionId/entities/:entityId/stakeholders
PATCH /api/v1/missions/:missionId/stakeholders/:stakeholderId
POST  /api/v1/missions/:missionId/entities/:entityId/stakeholders/research
```

### 17 11 Contact Paths

```text
GET   /api/v1/missions/:missionId/contact-points
GET   /api/v1/missions/:missionId/contact-points/:contactPointId
POST  /api/v1/missions/:missionId/contact-points/:contactPointId/verify
POST  /api/v1/missions/:missionId/contact-points/:contactPointId/confirm
POST  /api/v1/missions/:missionId/contact-points/:contactPointId/mark-stale
POST  /api/v1/missions/:missionId/entities/:entityId/contact-research
PATCH /api/v1/missions/:missionId/contact-points/:contactPointId
```

### 17 12 Opportunities

```text
GET   /api/v1/missions/:missionId/opportunities
GET   /api/v1/missions/:missionId/opportunities/:opportunityId
POST  /api/v1/missions/:missionId/opportunities
PATCH /api/v1/missions/:missionId/opportunities/:opportunityId
POST  /api/v1/missions/:missionId/opportunities/:opportunityId/research
POST  /api/v1/missions/:missionId/opportunities/:opportunityId/pause
POST  /api/v1/missions/:missionId/opportunities/:opportunityId/resume
POST  /api/v1/missions/:missionId/opportunities/:opportunityId/archive
GET   /api/v1/missions/:missionId/opportunities/:opportunityId/scores
```

### 17 13 Action Cards

```text
GET   /api/v1/missions/:missionId/action-cards
GET   /api/v1/missions/:missionId/action-cards/:actionCardId
PATCH /api/v1/missions/:missionId/action-cards/:actionCardId
POST  /api/v1/missions/:missionId/action-cards/:actionCardId/approve
POST  /api/v1/missions/:missionId/action-cards/:actionCardId/request-changes
POST  /api/v1/missions/:missionId/action-cards/:actionCardId/regenerate
POST  /api/v1/missions/:missionId/action-cards/:actionCardId/execute
GET   /api/v1/missions/:missionId/action-cards/:actionCardId/export
```

### 17 14 Interactions

```text
POST /api/v1/missions/:missionId/opportunities/:opportunityId/interactions
GET  /api/v1/missions/:missionId/opportunities/:opportunityId/interactions
GET  /api/v1/missions/:missionId/interactions
```

### 17 15 Timeline 与 Runs

```text
GET /api/v1/missions/:missionId/timeline
GET /api/v1/missions/:missionId/runs
GET /api/v1/missions/:missionId/runs/:runId
```

### 17 16 Refresh Center

```text
GET  /api/v1/missions/:missionId/refresh-proposals
GET  /api/v1/missions/:missionId/refresh-proposals/:proposalId
POST /api/v1/missions/:missionId/refresh-proposals/:proposalId/accept
POST /api/v1/missions/:missionId/refresh-proposals/:proposalId/research
POST /api/v1/missions/:missionId/refresh-proposals/:proposalId/defer
```


### 17 17 API 错误响应

```ts
interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  meta: {
    requestId: string
    timestamp: string
  }
}
```

错误代码

```text
AUTH_INVALID_CREDENTIALS
AUTH_SESSION_EXPIRED
AUTH_PERMISSION_DENIED
WORKSPACE_MEMBER_NOT_FOUND
MISSION_NOT_FOUND
MISSION_STAGE_CONFLICT
MISSION_BUDGET_EXHAUSTED
MISSION_WORKFLOW_UNAVAILABLE
SOURCE_UPLOAD_INVALID
SOURCE_FETCH_FAILED
CLAIM_NOT_FOUND
ROUTE_NOT_FOUND
ROUTE_APPROVAL_REQUIRED
ENTITY_NOT_FOUND
ENTITY_RESOLUTION_REQUIRED
STAKEHOLDER_NOT_FOUND
CONTACT_POINT_NOT_FOUND
CONTACT_VERIFICATION_REQUIRED
OPPORTUNITY_NOT_FOUND
OPPORTUNITY_STATE_CONFLICT
ACTION_CARD_NOT_FOUND
ACTION_CARD_APPROVAL_REQUIRED
INTERACTION_INVALID
ARTIFACT_VERSION_CONFLICT
CONNECTOR_RATE_LIMITED
CONNECTOR_UNAVAILABLE
AGENT_OUTPUT_INVALID
AGENT_EVIDENCE_INSUFFICIENT
WORKFLOW_SIGNAL_FAILED
EXPORT_FAILED
VALIDATION_ERROR
INTERNAL_ERROR
```

HTTP 状态映射

| 场景 | 状态码 |
|---|---:|
| 输入校验 | 400 |
| 登录状态 | 401 |
| 权限 | 403 |
| 对象缺失 | 404 |
| 状态冲突 | 409 |
| 预算评审 | 422 |
| 速率限制 | 429 |
| Connector 暂时不可用 | 503 |
| 系统错误 | 500 |

### 17 18 SSE 协议

Endpoint

```text
GET /api/v1/missions/:missionId/stream
```

事件结构

```ts
interface MissionStreamEvent {
  id: string
  type: string
  missionId: string
  opportunityId?: string
  occurredAt: string
  payload: Record<string, unknown>
}
```

事件类型

```text
mission.progress.updated
mission.metrics.updated
approval.created
approval.updated
artifact.updated
route.updated
entity.updated
contact.updated
opportunity.updated
action_card.updated
interaction.updated
refresh.updated
run.updated
timeline.appended
```

客户端行为

- 页面加载时先请求 REST Read Model
- 页面建立 SSE 连接
- 收到事件后更新对应 TanStack Query Cache
- 连接中断后携带 Last Event ID 重连
- 重连后服务端补发最近一百条未确认事件
- 事件积压超过一百条时客户端重新请求完整 Read Model

### 17 19 API 幂等

以下写接口接受 Idempotency Key Header

- 创建 Mission
- 启动 Mission
- 上传 Source
- 批量创建 Opportunity
- 批准 Route
- 批准 Action Card
- 标记 Action Card 已执行
- 新增 Interaction
- 接受 Refresh Proposal

服务端保存

- tenant_id
- idempotency_key
- endpoint
- request_hash
- response_status
- response_body
- expires_at

同一 Tenant，同一 Endpoint，同一 Idempotency Key 返回首次成功响应

## 十八 Domain Events

V1 事件清单

```text
workspace.created
member.added
mission.created
mission.started
mission.stage_changed
mission.paused
mission.resumed
mission.completed
source.added
source.snapshot_created
claim.proposed
claim.confirmed
claim.updated
claim.contradicted
artifact.version_proposed
artifact.version_accepted
artifact.version_superseded
route.proposed
route.approved
route.deprioritized
entity.discovered
entity.resolved
entity.merged
relationship.discovered
stakeholder.discovered
contact.discovered
contact.verified
contact.confirmed
contact.stale
contact.invalid
opportunity.created
opportunity.scored
opportunity.status_changed
action_card.created
action_card.updated
action_card.approved
action_card.executed
interaction.recorded
interaction.interpreted
refresh.started
refresh.proposal_created
refresh.proposal_accepted
agent_run.started
agent_run.completed
agent_run.failed
tool_run.started
tool_run.completed
tool_run.failed
budget.threshold_reached
user.override
```

事件 Payload 通用字段

```ts
interface DomainEventPayload {
  tenantId: string
  missionId?: string
  opportunityId?: string
  aggregateId: string
  actor: {
    type: 'user' | 'agent' | 'system'
    id?: string
  }
  before?: unknown
  after?: unknown
  evidenceRefs?: string[]
  metadata?: Record<string, unknown>
}
```

## 十九 质量门

### 19 1 Route Approval Gate

进入生态研究阶段的条件

- 至少一条路线为 approved
- approved 路线具有至少两条证据
- approved 路线具有关键组织类型
- approved 路线具有关键利益角色
- approved 路线具有主要触达渠道
- 用户完成路线评审

### 19 2 Target Gate

目标组织进入高优先级列表的条件

- 实体消歧完成
- 官方网站或官方注册信息存在其一
- 市场角色明确
- 与 approved 路线相关
- 产品适配分达到 50
- 证据质量分达到 40

### 19 3 Contact Gate

机会进入 contact_path_verified 的条件

- 至少一个利益角色
- 至少一条触达路径
- 主要触达路径具有来源
- 主要触达路径验证分达到 50
- 主要触达路径最近验证时间在九十天内
- 备用触达路径存在

### 19 4 Action Card Gate

机会进入 action_ready 的条件

- Opportunity Score 已生成
- 主要利益角色已确定
- 主要触达路径已确定
- 备用触达路径已确定
- 联系理由已生成
- 对方利益点已生成
- 首次联系目标已生成
- 至少一种联系内容已生成
- 证据引用覆盖率达到 80

### 19 5 Interaction Interpretation Gate

互动解释写入业务事实的条件

- Interaction 已保存
- 新事实具有明确来源
- 用户原始输入作为 Source Snapshot 保存
- 提取结果通过 Schema 校验
- 推荐状态迁移通过状态机校验

## 二十 权限与安全

### 20 1 多租户

- 所有业务表包含 tenant_id
- API 从登录会话解析 tenant_id
- Repository 层统一注入 tenant_id
- PostgreSQL 启用 Row Level Security
- 对象存储路径使用 tenant_id 前缀
- Temporal Workflow ID 包含 tenant 与业务标识哈希

### 20 2 认证

- 密码使用 Argon2id
- 登录成功签发短期 Access Token
- HttpOnly Cookie 保存 Token
- Cookie 使用 SameSite Lax
- 生产环境启用 Secure
- 登录与注册接口启用速率限制

### 20 3 机密配置

- API Key 使用环境变量或 Secret Manager
- 数据库中保存 Connector 配置时使用 AES GCM 加密
- 日志中使用字段脱敏
- 导出操作写入审计事件

### 20 4 联系方式数据

- 系统保存公开商务触达路径
- 每条联系方式保留来源与公开属性
- 用户可标记失效并触发后续刷新
- 导出内容包含来源与最近验证时间
- 工作区拥有联系方式删除入口

## 二十一 可观测性

### 21 1 Trace 属性

每个 Trace 包含

- tenant_id
- mission_id
- opportunity_id
- workflow_id
- workflow_run_id
- agent_run_id
- tool_run_id
- artifact_version_id
- prompt_version
- model_name

### 21 2 工程指标

- Workflow 成功率
- Workflow 运行数量
- Activity 重试率
- Activity 平均耗时
- Search Connector 成功率
- Browser Connector 成功率
- Agent Schema 校验通过率
- Agent 证据覆盖率
- 队列积压
- Token 消耗
- 任务成本
- API P95 延迟
- SSE 活跃连接

### 21 3 业务指标

- 每个任务发现的目标组织数
- 每个任务已验证触达路径数
- 高优先级目标触达覆盖率
- 行动卡批准率
- 行动卡修改率
- 目标发现到行动就绪时间
- 触达路径有效率
- 有效互动数
- 机会状态跃迁数
- 单位销售资源的机会价值

## 二十二 性能与可靠性要求

### 22 1 页面性能

- 仪表盘首屏服务端响应 P95 小于 1200 毫秒
- 工作台表格查询 P95 小于 1500 毫秒
- 单页默认返回 50 条记录
- 图谱首次加载默认最多 200 个节点与 400 条边
- 图谱通过筛选与分页继续加载

### 22 2 API 性能

- 普通读取接口 P95 小于 800 毫秒
- 普通写入接口 P95 小于 1200 毫秒
- Workflow 启动接口在 2000 毫秒内返回 workflow_id
- 文件上传最大 50 MB

### 22 3 可靠性

- 所有 Workflow 具备恢复能力
- 所有外部 Activity 具备重试策略
- 所有写操作使用事务
- 所有副作用 Activity 使用幂等键
- Source Snapshot 使用内容哈希去重
- Contact Point 使用标准化值去重
- Agent 输出 Schema 校验失败时自动重试一次并携带校验错误
- 连续失败的 Activity 进入 failed 状态并创建用户待办

### 22 4 预算控制

每次外部调用前检查

- 任务搜索额度
- 网页抓取额度
- Agent 运行额度
- Token 额度
- 目标组织额度
- 联系方式额度

额度使用达到 80 时创建提醒事件

额度使用达到 100 时 Mission 进入 awaiting_budget_review 阶段

## 二十三 测试策略

### 23 1 单元测试

覆盖

- 状态机
- 机会评分
- 资源效率
- 联系方式验证分
- 质量门
- 权限策略
- 预算策略
- 实体标准化
- URL 标准化
- 邮箱标准化

覆盖率目标

- domain 包 90
- policies 包 90
- contracts 包 95

### 23 2 数据库集成测试

覆盖

- Migration
- RLS
- Repository Tenant Filter
- Domain Event 与 Outbox 同事务
- Artifact Version 切换
- Entity Merge
- Contact Deduplication
- Opportunity State Transition

### 23 3 Workflow 测试

使用 Temporal Test Environment

覆盖

- Mission 正常流程
- 路线审批等待
- Mission 暂停与恢复
- Activity 重试
- Child Workflow 启动
- Opportunity 行动卡审批
- Interaction Signal
- Continue As New
- Budget Review

### 23 4 Connector Contract Test

每个 Connector 必须实现

- 成功结果
- 空结果
- 超时结果
- 速率限制结果
- 部分结果
- 内容哈希
- Tool Run 写入

### 23 5 Agent Eval

创建固定测试集

- 阀门企业进入德国
- 工业传感器企业进入印度尼西亚
- 家电零部件企业进入墨西哥

每个测试集包含

- 用户输入
- 本地网页 Fixture
- 本地搜索 Fixture
- 预期路线类型
- 预期关键组织类型
- 预期触达路径类型
- 预期行动卡字段

评估指标

- Schema 通过率
- 证据引用覆盖率
- 路线类型命中率
- 实体重复率
- 联系方式来源完整率
- 行动卡字段完整率

### 23 6 端到端测试

使用 Playwright

场景一

- 注册
- 创建工作区
- 创建市场任务
- 等待 Mock Workflow 完成路线研究
- 批准路线
- 查看目标组织
- 查看联系方式
- 批准行动卡
- 记录互动
- 查看机会状态变化

场景二

- 上传企业资料
- 查看能力声明
- 修改声明
- 查看受影响路线

场景三

- 触发每周刷新
- 查看刷新提案
- 接受提案
- 查看时间线

## 二十四 本地开发环境

### 24 1 Docker Compose 服务

```text
postgres
postgres-migrate
temporal
temporal-ui
minio
api
worker
projector
web
```

### 24 2 环境变量

```text
NODE_ENV
APP_BASE_URL
API_BASE_URL
DATABASE_URL
JWT_SECRET
COOKIE_SECRET
ENCRYPTION_KEY
TEMPORAL_ADDRESS
TEMPORAL_NAMESPACE
TEMPORAL_TASK_QUEUE_PREFIX
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
S3_FORCE_PATH_STYLE
OPENAI_API_KEY
OPENAI_MODEL_RESEARCH
OPENAI_MODEL_EXTRACTION
OPENAI_MODEL_WRITING
TAVILY_API_KEY
OTEL_EXPORTER_OTLP_ENDPOINT
LOG_LEVEL
MOCK_CONNECTORS
MOCK_MODEL_PROVIDER
```

### 24 3 开发命令

```text
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm test
pnpm test:integration
pnpm test:workflow
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

## 二十五 Demo 数据

### 25 1 Demo 企业

```text
企业名称
NovaFlow Industrial Co

企业官网
使用本地 Fixture Website

主要产品
Industrial Ball Valves
Gate Valves
Control Valves

目标国家
Germany

目标行业
Chemical Processing
Water Treatment
Industrial Equipment

目标合作对象
Distributors
EPC Companies
Large Industrial End Users

成功标准
形成三条经用户批准的市场路线
发现二十个目标组织
形成十个具备已验证触达路径的机会
生成五张可直接执行的行动卡
```

### 25 2 Demo 市场路线

Fixture 预期包含

- 德国本地工业阀门经销商路线
- 化工项目 EPC 路线
- 大型工业终端直采与供应商注册路线
- 行业展会与协会路线

### 25 3 Demo 实体

使用完全虚构的名称

- RheinWerk Distribution GmbH
- EuroChem Projects GmbH
- NordWater Systems GmbH
- IndustrieArmaturen Verband
- ProcessTech Expo
- VectorValve Europe GmbH

### 25 4 Demo 联系方式

所有 Demo 联系方式使用保留域名

```text
sales@rheinwerk.example
procurement@eurochem-projects.example
https://nordwater.example/supplier-registration
https://processtech.example/meeting-booking
```

### 25 5 Mock Provider

V1 必须实现

- MockModelProvider
- MockSearchConnector
- MockBrowserConnector
- MockContactVerificationConnector

Mock Provider 使用固定 Fixture 返回确定性结果

本地端到端演示在缺少外部 API Key 时仍可完整运行

## 二十六 导出规格

### 26 1 Action Card Markdown

文件名

```text
{mission_slug}-{organization_slug}-action-card-v{version}.md
```

内容顺序

- Opportunity Summary
- Target Organization
- Stakeholder
- Contact Paths
- Why Contact
- Stakeholder Interest
- Value Hypothesis
- First Contact Objective
- Message Templates
- Attachments
- Follow Up Plan
- Success Signals
- Evidence
- Unknowns

### 26 2 CSV

字段

```text
mission_name
country
organization_name
organization_website
market_role
route_type
opportunity_status
priority
score
commercial_value_band
resource_efficiency
stakeholder_role
person_name
person_title
primary_contact_type
primary_contact_value
primary_contact_source
primary_contact_verified_at
backup_contact_type
backup_contact_value
contact_reason
value_hypothesis
first_contact_objective
email_subject
email_body
social_message
next_action
owner
due_at
```

### 26 3 全任务导出

生成 zip

包含

- mission.json
- capability-ledger.csv
- market-routes.md
- entities.csv
- relationships.csv
- contact-points.csv
- opportunities.csv
- action-cards 文件夹
- evidence-index.csv
- timeline.csv


## 二十六 A 工程编码规范

### 26 A 1 TypeScript

- tsconfig 启用 strict
- 公共函数声明显式输入与输出类型
- 外部输入先进入 Zod Parse
- 运行时边界使用 unknown
- Domain 包使用纯函数与不可变值对象
- API DTO 直接复用 packages contracts 中的 Schema
- Enum 由数据库 Enum 与 Zod Enum 同源生成

### 26 A 2 模块依赖方向

```text
apps
    ↓
application services
    ↓
domain
    ↓
contracts
```

基础设施实现依赖 domain interface

domain 包只依赖 TypeScript 标准能力与 contracts 中的基础类型

### 26 A 3 Repository

每个核心聚合提供 Repository Interface

```ts
interface MissionRepository {
  findById(tenantId: string, missionId: string): Promise<Mission | null>
  create(input: CreateMissionData): Promise<Mission>
  update(input: UpdateMissionData): Promise<Mission>
}
```

Repository 方法首个参数始终为 tenantId

复杂读取通过 Read Model Query Service 完成

### 26 A 4 Transaction

业务写入使用 Transaction Manager

```ts
await transactionManager.run(async tx => {
  await missionRepository.update(tx, update)
  const event = await domainEventRepository.append(tx, eventInput)
  await outboxRepository.enqueue(tx, event)
})
```

### 26 A 5 错误模型

Domain Error 字段

- code
- message
- details
- retryable
- cause

Activity Error 额外字段

- activityType
- connectorType
- agentRunId
- toolRunId

### 26 A 6 日志

结构化日志字段

- level
- message
- service
- request_id
- tenant_id
- mission_id
- opportunity_id
- workflow_id
- agent_run_id
- tool_run_id
- duration_ms
- error_code

### 26 A 7 数据迁移

- Migration 文件按时间排序
- 每个工作包独立 Migration
- Seed 与 Migration 分离
- Enum 变化提供向前迁移脚本
- CI 在空数据库运行全部 Migration
- CI 在上一个发布版本数据库运行增量 Migration

### 26 A 8 Frontend

页面目录

```text
app
  login
  register
  dashboard
  missions
    new
    [missionId]
      page
      capability-ledger
      market-routes
      ecosystem
      targets
      contact-paths
      opportunities
      action-queue
      refresh-center
      timeline
      runs
```

组件目录

```text
components
  mission
  capability
  route
  ecosystem
  target
  contact
  opportunity
  action-card
  evidence
  timeline
  runs
  shared
```

每个业务组件接收稳定 View Model

页面数据由 Server Component 读取首屏数据

客户端交互由 TanStack Query 与 SSE 完成

### 26 A 9 API

- Controller 负责 DTO，权限与响应
- Application Service 负责用例编排
- Domain Service 负责业务规则
- Repository 负责持久化
- Temporal Gateway 负责 Workflow Start，Signal 与 Query
- Outbox 负责异步事件传播

### 26 A 10 Git 与文档

分支命名

```text
feat/wp-01-infrastructure
feat/wp-02-auth
fix/contact-verification-score
```

提交信息

```text
feat(mission): add mission creation workflow
fix(contact): normalize role email values
chore(db): add opportunity score migration
```

每个工作包更新

- README
- docs/implementation-status.md
- docs/api.md
- docs/data-model.md
- docs/workflows.md

## 二十七 实现工作包

### WP 01 Monorepo 与基础设施

交付

- pnpm workspace
- Turborepo
- apps 与 packages 目录
- Docker Compose
- PostgreSQL
- Temporal
- MinIO
- 环境变量校验
- 统一日志

验收

- 一条命令启动全部基础设施
- web，api，worker，projector 均可启动
- health endpoint 返回正常

### WP 02 Auth 与 Multi Tenant

交付

- 注册
- 登录
- 登出
- Workspace 创建
- Member Role
- JWT Cookie
- Argon2
- RLS

验收

- 两个工作区的数据完全隔离
- Owner，Editor，Viewer 权限生效

### WP 03 Database Schema 与 Event Infrastructure

交付

- 全部 V1 Migration
- Drizzle Schema
- Repository
- Domain Event Writer
- Outbox Dispatcher
- Seed

验收

- 事务写入业务表与事件表
- Projector 消费事件并更新读取模型

### WP 04 Mission CRUD 与创建向导

交付

- Mission API
- Mission 创建向导
- 任务列表
- 任务详情框架
- 预算配置

验收

- 用户可创建草稿
- 用户可启动任务
- 启动后创建 Temporal Workflow

### WP 05 Source Ingestion

交付

- URL Source
- File Upload
- Company Website Crawl
- Snapshot
- Object Storage
- Chunk
- Embedding

验收

- 企业官网内容保存为 Source 与 Snapshot
- 相同内容通过 Hash 去重
- 上传资料可在工作台查看

### WP 06 Agent Runtime

交付

- AgentRunner
- ModelProvider
- MockModelProvider
- PromptRegistry
- Zod Output Validation
- Agent Run 与 Tool Run 记录
- Token 与成本记录

验收

- 任意 Skill 可通过统一 Runner 执行
- Schema 校验结果可追踪
- Mock Provider 产生确定性结果

### WP 07 Mission Compiler 与 Capability Ledger

交付

- Mission Compiler Skill
- Capability Extractor Skill
- Mission Brief Artifact
- Capability Claims
- Capability Ledger 页面
- 用户确认与修改

验收

- Demo 任务产生任务卡
- Demo 任务产生能力声明
- 用户修改声明后写入事件与新版本

### WP 08 Market Route Research

交付

- Web Search Connector
- Browser Connector
- Market Route Researcher
- Competitor Researcher
- Expert Signal Researcher
- Market Routes 页面
- 路线审批

验收

- Demo 任务产生至少三条路线
- 每条路线具有证据与关键组织类型
- 用户批准后 Workflow 继续运行

### WP 09 Ecosystem Graph

交付

- Ecosystem Mapper
- Entity Resolver
- Entity 与 Relationship Repository
- React Flow 图谱
- 实体详情抽屉
- 关系证据抽屉

验收

- Demo 任务产生至少二十个实体
- 实体重复项完成合并
- 图谱支持筛选与详情查看

### WP 10 Targets 与 Opportunity Creation

交付

- Target Ranking
- Targets 页面
- Opportunity 创建
- Opportunity Workflow
- Opportunity Score

验收

- Demo 任务形成前二十个目标
- 用户可批量创建机会
- 机会分数具有维度解释

### WP 11 Stakeholder Mapping

交付

- Stakeholder Mapper
- Stakeholder 数据表
- 实体详情中的 Stakeholder 区域
- Opportunity Stakeholder 区域

验收

- 每个高优先级机会至少一个利益角色
- 支持人员未知与部门已知

### WP 12 Contact Discovery 与 Verification

交付

- Contact Path Finder
- Contact Verification Connector
- Contact Point 数据模型
- Contact Paths 页面
- 主要路径与备用路径

验收

- Demo 高优先级机会均有主要触达路径
- 至少五个机会达到 contact_path_verified
- 每条联系方式具有来源与验证时间

### WP 13 Action Card

交付

- Opportunity Qualifier
- Action Card Builder
- Action Queue
- Action Card 详情
- 编辑
- 审批
- 复制
- Markdown 导出
- CSV 导出

验收

- Demo 任务产生五张完整行动卡
- 行动卡通过质量门
- 用户可批准并导出

### WP 14 Interaction Feedback Loop

交付

- Interaction Form
- Interaction Interpreter
- Opportunity 状态更新
- Contact 状态更新
- Route Confidence 更新
- 新 Action Card Version

验收

- 用户记录回复后机会状态发生迁移
- 新事实进入 Claim 与 Evidence
- 时间线展示完整变化

### WP 15 Refresh Workflow

交付

- Refresh Schedule
- Refresh Workflow
- Source Hash Comparison
- Refresh Proposal
- Refresh Center

验收

- 手动触发刷新可产生提案
- 接受提案后更新业务对象与时间线

### WP 16 Dashboard，Timeline 与 Runs

交付

- Dashboard 指标
- Mission Overview
- Timeline
- Runs
- SSE 实时更新

验收

- Workflow 状态变化在五秒内显示到前端
- 用户可查看 Agent 与 Tool 运行详情

### WP 17 Tests 与 Demo

交付

- Unit Tests
- Integration Tests
- Workflow Tests
- Connector Contract Tests
- Agent Eval Fixtures
- Playwright E2E
- Demo Seed

验收

- pnpm test 全部通过
- pnpm test:e2e 全部通过
- Mock 模式完成端到端演示

### WP 18 Deployment

交付

- Production Dockerfile
- Database Migration Job
- Temporal Namespace 配置
- S3 配置
- OpenTelemetry 配置
- Health Check
- Readiness Check

验收

- 生产构建成功
- 新环境可通过文档完成部署
- 数据库 Migration 自动执行

## 二十八 验收标准

### 28 1 任务创建

Given 用户已登录

When 用户填写企业，产品，国家，目标与预算并创建任务

Then 系统创建 Mission，启动 Mission Workflow，并在工作台显示实时阶段

### 28 2 企业能力证据

Given Mission 已开始

When 系统抓取企业官网与用户资料

Then 系统生成能力声明，每条声明具有状态，置信度，证据与影响范围

### 28 3 市场路线

Given 企业能力声明已生成

When 路线研究完成

Then 系统展示至少三条路线，每条路线具有关键组织，关键角色，触达渠道，证据，反证与评分

### 28 4 用户路线审批

Given 路线处于 proposed

When 用户批准至少一条路线并提交评审

Then Mission Workflow 进入生态研究阶段

### 28 5 生态图谱

Given 路线已批准

When Ecosystem Mapper 完成

Then 系统展示实体与关系图谱，节点与边均可查看证据

### 28 6 目标组织

Given 图谱已生成

When 系统完成目标排序

Then Targets 页面显示目标组织与透明评分维度

### 28 7 利益相关者

Given 目标组织进入高优先级

When Stakeholder Mapper 完成

Then 组织详情显示至少一个利益角色及其判断依据

### 28 8 联系方式

Given 利益角色已识别

When Contact Path Finder 与 Verification 完成

Then 高优先级机会具有主要路径，备用路径，来源，验证状态与最近验证时间

### 28 9 行动卡

Given Opportunity 满足 Action Card Gate

When Action Card Builder 完成

Then 系统生成完整行动卡并进入 review 状态

### 28 10 用户执行

Given 行动卡已批准

When 用户复制内容或导出行动卡并标记已执行

Then Action Card 进入 executed，Opportunity 进入 contacted

### 28 11 互动反馈

Given Opportunity 已 contacted

When 用户记录回复或会议信息

Then 系统提取新事实，更新机会状态与下一步行动，并生成新的行动卡版本

### 28 12 白盒可追踪

Given 任意路线，机会或行动卡

When 用户查看详情

Then 用户可查看结论，证据，来源，置信度，生成者，版本与影响对象

### 28 13 预算

Given 任务预算已配置

When 外部调用消耗达到阈值

Then 系统生成预算提醒并在达到上限时进入预算评审阶段

### 28 14 刷新

Given Mission 为 active

When 每周刷新执行

Then 系统产生变化提案并在用户接受后更新相关对象

### 28 15 多租户

Given 两个独立工作区

When 用户访问任务，实体，联系方式与机会

Then 用户只能读取当前工作区数据

## 二十九 Definition of Done

V1 进入可交付状态需要同时满足

- 本文档全部 V1 页面可访问
- Mission Workflow 可完整运行
- Opportunity Workflow 可完整运行
- Refresh Workflow 可手动与定时运行
- Mock Provider 可完成完整演示
- Live Provider 可完成官网抓取，Web Search，Browser Fetch 与 Agent Run
- Demo 任务形成三条批准路线
- Demo 任务形成二十个目标组织
- Demo 任务形成十个具有触达路径的机会
- Demo 任务形成五张完整行动卡
- 用户可记录互动并触发机会更新
- 所有核心对象具有证据与版本记录
- 所有核心状态变化具有 Domain Event
- RLS 与权限测试通过
- Unit Test，Integration Test，Workflow Test，E2E Test 全部通过
- Production Build 通过
- Docker Compose 本地环境可一键启动
- README 包含安装，启动，测试，演示与部署步骤

## 三十 Codex 开发执行顺序

Codex 按以下顺序执行

```text
WP 01
WP 02
WP 03
WP 04
WP 05
WP 06
WP 07
WP 08
WP 09
WP 10
WP 11
WP 12
WP 13
WP 14
WP 15
WP 16
WP 17
WP 18
```

每个工作包完成时执行

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

每个工作包提交内容包含

- 数据库 Migration
- Domain Contract
- API
- Workflow 或 Activity
- 前端页面
- Unit Test
- Integration Test
- 更新后的 README

每个工作包完成后在 `docs/implementation-status.md` 更新

- 当前工作包状态
- 已完成内容
- 数据库变化
- API 变化
- 页面变化
- 测试结果
- 下一工作包入口

## 三十一 最终产品行为

用户创建一个工业品出海市场任务后，系统自动解析企业公开资料并建立能力证据账本

系统研究目标市场中的渠道合作，龙头直采，EPC，招投标，展会，协会与专家网络等进入路线

用户查看路线依据并批准认可的路线

系统围绕批准路线发现组织，项目，竞争对手，行业专家与业务关系

系统识别应该接近的利益相关者，找到公开联系方式，采购入口，供应商注册，展会预约，协会介绍与转介绍路径

系统为高优先级目标生成透明评分与市场进入行动包

用户直接复制或导出联系内容并完成外联

用户记录回复，拒绝，转介绍，会议，样品，供应商注册与报价结果

系统将真实互动转化为新事实，更新路线，机会，联系人与下一步动作

整个系统持续把稀疏的企业需求转化为可触达，可解释，可执行，可验证的市场进入机会
