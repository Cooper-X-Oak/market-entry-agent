---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T16:50:07+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 利益相关者与联系路径 02：contact-discovery 联系路径发现：ASCII IA 工程解析

> **业务问题**：为目标组织和利益角色找到可公开引用、有主备关系、能进入后续验证的联系入口
> **入口 / 根节点**：`OpportunityWorkflow` → `activities.findContactPaths()` / `contact_path_finder`
> **相关文件**：`apps/worker/src/activities.ts` / `packages/agents/src/skills.ts` / `packages/contracts/src/research.ts` / `packages/database/src/schema/research.ts` / `packages/database/src/schema/execution.ts`

## 1. 总体架构

~~~text
Opportunity + Stakeholder Map + Organization
    ↓ contact_path_finder Agent
ContactPathOutput
├─ contactCandidates[]
│  ├─ contactType / value / normalizedValue
│  ├─ recommendedRank
│  ├─ sourceAuthority
│  ├─ contactEvidenceRefs[]
│  └─ employmentEvidenceRefs[]
└─ primary + backup（质量规则至少2个联系点）
    ↓
contact_points + opportunity_contacts + evidence_links
~~~

## 2. 页面与 API 信息架构

~~~text
自动发现
└─ OpportunityWorkflow
   → findContactPaths(opportunityId)

人工研究入口
└─ POST /entities/:entityId/contact-research
   → MissionWorkflow.manualRefreshRequested

消费页面
└─ /missions/[missionId]/contact-paths
   ├─ 联系类型 / 联系值 / 组织 / 角色
   ├─ primary / backup
   └─ 继续读取每个联系点详情
~~~

## 3. 联系点数据结构

~~~text
contact_points
├─ organizationEntityId / personEntityId / stakeholderRoleId
├─ contactType / value / normalizedValue
├─ isPublic
├─ sourceId / sourceLocator
├─ status='discovered'
├─ confidence / lastVerifiedAt
├─ preferredRank
├─ language / timezone
└─ metadata

opportunity_contacts
├─ opportunityId
├─ contactPointId
└─ usage = recommendedRank==1 ? primary : backup
~~~

## 4. Agent 与证据规则结构

~~~text
contact_path_finder
├─ 官方来源优先
├─ 禁止猜测私人联系方式
├─ 必须提供 primary + backup
├─ assertSkillQuality：至少2个 contact points
└─ Connectors
   ├─ web_search
   ├─ browser
   ├─ social_public_search
   └─ contact_verification

每个候选联系点
├─ 第1条 contactEvidenceRef → direct_listing
├─ 后续 contactEvidenceRef → corroboration
└─ employmentEvidenceRef → employment_confirmation
~~~

## 5. 发现与持久化流程

~~~text
findContactPaths()
  ↓ 运行 contact_path_finder
保存 Agent Decision Report
  ↓
写 contact_path_set Artifact Version
  ↓ 对每个候选
检查至少有一条 contactEvidenceRef
  ├─ 无 → CONTACT_EVIDENCE_MISSING
  └─ 有
      ↓
upsert contact_points
      ↓
insert opportunity_contacts
      ↓
insert contact_point_evidence_links
      ↓
contact_point.discovered.v1
contact_point.evidence_linked.v1
  ↓
Opportunity → contact_path_found
~~~

## 6. 数据、Artifact 与资源流程

~~~text
公开来源
├─ 官方网站联系页
├─ 官方目录 / 采购入口
└─ 公开职业和组织信息
    ↓ source + evidence_item
Contact Path Set Artifact
    ↓ evidence UUID
contact_point_evidence_links
├─ relationType
├─ sourceAuthority
└─ independentGroupKey
    ↓
后续 verifyContactPoint() 读取全部证据

视觉资源
└─ 无专属图片；页面以表格、证据摘录和状态组件呈现
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ 官方公开联系入口优先的 Agent 规则
├─ 主路径和备选路径结构
├─ 联系点去重键：(missionId, contactType, normalizedValue)
├─ 联系点、Opportunity 关系和证据关系落库
└─ 无直接联系证据时阻断候选写入

当前缺口
├─ 一个候选的全部证据链接共用 independentGroupKeys[0]
│  └─ 多个真实独立来源可能被折叠成同一证据组
├─ contact_points 冲突更新只刷新 confidence / updatedAt
│  └─ 不刷新来源、locator、rank、角色等字段
├─ researchContacts() 只发通用刷新，未携带组织和联系范围
├─ researchContacts() 未见显式业务权限检查
└─ 页面“下载/导出”按钮没有处理函数

当前未确认
└─ 未运行网络研究；公开入口可达性、去重效果和主备覆盖未实测
~~~

## 8. 一句话工程解释

~~~text
联系路径发现把公开网页证据转换成去重后的主备联系点并绑定到 Opportunity，但独立证据组和冲突更新逻辑仍可能损失来源细节
~~~
