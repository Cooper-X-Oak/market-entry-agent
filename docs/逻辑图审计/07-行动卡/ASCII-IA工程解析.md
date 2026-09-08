---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 07 行动卡：ASCII IA 工程解析

> **业务区域**：把已验证、已评分的市场机会转换成可审批、可复制、可导出、由用户实际执行的外联动作
> **上游**：Opportunity 资格评分、目标角色、主备联系点、已批准路线和证据
> **下游**：真实外联、互动记录、机会状态推进

## 1. 总体架构

~~~text
Opportunity(status='contact_path_verified')
    ↓ 01 action-card-build
action_card_builder + Action Card Gate
    ↓ action_cards.status='review'
02 action-card-review
    ├─ edit current row
    ├─ approve
    └─ request changes → new version
          ↓ approved
03 action-card-execute-export
    ├─ Markdown / CSV export
    └─ 用户完成外联后标记 executed
          ↓ Opportunity='contacted'
~~~

## 2. 业务信息架构

~~~text
行动卡
├─ 01-action-card-build
│  ├─ 为什么联系
│  ├─ 为什么是现在
│  ├─ 对方利益点与价值假设
│  ├─ 邮件 / 短消息 / 电话 / 表单内容
│  └─ 跟进计划与成功信号
├─ 02-action-card-review
│  ├─ 编辑
│  ├─ 批准
│  ├─ 请求修改
│  └─ 重新生成版本
└─ 03-action-card-execute-export
   ├─ Markdown
   ├─ CSV
   ├─ 完整任务 ZIP
   └─ 标记已执行
~~~

## 3. 页面与 API 信息架构

~~~text
Web
├─ /missions/[missionId]/action-queue
│  ├─ 待审批
│  ├─ 已批准待执行
│  ├─ 今日到期
│  ├─ 待跟进
│  └─ 已完成
└─ /missions/[missionId]/action-queue/[actionCardId]
   ├─ ActionCardEditor
   ├─ 审批控制
   ├─ 版本与渠道
   └─ Markdown / CSV

API
├─ GET/PATCH /action-cards/:id
├─ POST /approve|request-changes|decision|regenerate|execute
└─ GET /export?format=markdown|csv
~~~

## 4. HTML / CSS / JS 结构

~~~text
ActionQueuePage
├─ Server Component
├─ groups[] + belongs(card, group)
├─ CSS Grid 行布局
└─ CommandButton → approve / execute

ActionCardPage
├─ canEdit / canApprove / canRequestChanges
├─ canExport / canExecute
├─ ActionCardEditor（Client）
│  ├─ Controlled input / textarea
│  ├─ navigator.clipboard.writeText
│  └─ PATCH expectedVersionNo
└─ CommandButton → decision / regenerate / execute
~~~

## 5. 交互与状态流程

~~~text
draft → review → approved → exported → executed → completed
          │          │
          └→ changes_requested ←┘
                   ↓
              新版本 draft/review

实际自动生成
└─ 直接创建 status='review'

实际执行原则
└─ 系统不发送邮件、不拨号、不提交表单
   └─ 用户完成真实外联后点击“标记已执行”
~~~

## 6. 数据、Artifact 与资源流程

~~~text
action_cards vN
├─ basedOnVersionNo / feedbackRefs
├─ targetStakeholderRoleId
├─ primary / backup ContactPointId
├─ content fields
├─ attachmentsRequired / followUpPlan
├─ successSignals / completionSignals
├─ ownerId / dueAt
└─ status / approvedBy / approvedAt
    ↓
Artifact Version: action_card
    ↓
approvals + domain_events
    ↓
Action Queue / Mission Export / InteractionForm
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ Agent 生成结构化外联内容
├─ Gate、版本号、人工编辑和审批
├─ 请求修改驱动的新版本生成
├─ Markdown / CSV / 完整任务 ZIP 导出
└─ V1 明确由人执行外联并记录结果

当前缺口
├─ API 审批先写 approval/event，再 Signal Workflow，存在跨系统分离窗口
├─ Worker 批准转移传空 evidenceRefs，与领域状态机要求冲突
├─ 手工编辑原地更新同一 versionNo，却发送 version_created 事件
├─ 导出发送 action_card.executed.v1，但不把状态改成 exported
├─ 行动队列分组有重叠，completed 状态反而不进入“已完成”
└─ 已批准后的“重新生成”Signal 只做研究，不一定创建新版本

当前未确认
└─ 未运行审批、导出或执行；跨事务失败、队列分组和文件内容未实测
~~~

## 8. 一句话工程解释

~~~text
行动卡把证据和联系路径变成需要人工批准并由人实际执行的外联脚本，但审批、版本和导出状态目前仍有几处事件语义与数据库事实不一致
~~~
