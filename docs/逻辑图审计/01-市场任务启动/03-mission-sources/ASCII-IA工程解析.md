---
created_at: '2026-09-03T16:50:07+08:00'
updated_at: '2026-09-03T18:25:00+08:00'
git_branch: 'main'
git_commit: '6159dc7f1c37ac1065bfd74262d7ce59a568967f'
---

# 市场任务启动 03：mission-sources 企业资料来源接入：ASCII IA 工程解析

> **业务问题**：把公开 URL 或企业文件接入 Mission，形成后续能力提取可引用的 Source 与 Snapshot
> **入口 / 根节点**：`SourceManager` / `POST /sources/url` / `POST /sources/upload`
> **相关文件**：`apps/web/components/source-manager.tsx` / `apps/api/src/market/missions.controller.ts` / `apps/api/src/market/market.service.ts` / `packages/connectors/src/document.ts` / `packages/connectors/src/storage.ts` / `packages/database/src/schema/missions.ts`

## 1. 总体架构

~~~text
企业资料来源接入
├─ 页面：SourceManager
├─ URL 通道：mission_sources + sources
├─ 文件通道：S3/MinIO + DocumentConnector + source_snapshots
├─ 读取通道：listSources / source / snapshots
└─ 事件通道：source.added.v1 → Outbox → Timeline/Read Model
~~~

### 层间工作顺序

~~~text
用户添加 URL 或上传文件
    ↓ SourceManager
apiClient + Idempotency-Key
    ↓
MarketService.addSourceUrl() / uploadSource()
    ↓
mission_sources → sources → optional source_snapshots
    ↓
source.added.v1
    ↓
Capability Evidence Extractor 消费有效来源
~~~

## 2. 页面与表单信息架构

~~~text
SourceManager({ missionId, sources })
├─ 添加公开 URL
│  ├─ input[type='url'][name='url']
│  └─ addUrl() → sourceKind='manual_url'
├─ 上传企业资料
│  ├─ input[type='file'][name='file']
│  ├─ accept='.pdf,.docx,.xlsx,.pptx'
│  └─ upload() → multipart/form-data
├─ pending → “资料处理中…”
├─ error → .error-state[role='alert']
└─ sources 列表
   └─ title/url/id + sourceType + lastFetchedAt + status
~~~

## 3. HTTP 与输入边界信息架构

~~~text
POST /sources/url
├─ body.url = z.url()
└─ sourceKind = website | manual_url（可选）

POST /sources/upload
├─ Fastify multipart：files=1 / fileSize=50MB
├─ service 再检查 bytes<=50MB
└─ extension 白名单
   ├─ pdf → parse_pdf
   ├─ docx → parse_docx
   ├─ xlsx → parse_xlsx
   └─ pptx → parse_pptx

读取
├─ GET /sources
├─ GET /sources/:sourceId
└─ GET /sources/:sourceId/snapshots
~~~

## 4. 运行时与持久化信息架构

~~~text
addSourceUrl()
├─ INSERT mission_sources(sourceKind, url)
└─ UPSERT sources by tenant+mission+normalizedUrl
   ├─ website → sourceType='company_website'
   ├─ 其他 → sourceType='search_result'
   └─ 冲突 → lastFetchedAt=now / status='active'

uploadSource()
├─ storage.put(tenantId, missionId, 'uploads', bytes, mime)
│  └─ objectKey={tenant}/{mission}/uploads/{sha256}
├─ DocumentConnector.execute(parse_*)
│  └─ officeParser.parseOfficeAsync()
└─ mutate source.added.v1
   ├─ INSERT mission_sources(uploaded_file)
   ├─ INSERT sources(uploaded_document)
   ├─ INSERT source_snapshots(contentHash/objectKey/extractedText)
   └─ UPDATE sources.latestSnapshotId
~~~

## 5. 用户交互与失败流程

~~~text
添加 URL 成功
└─ reset form → router.refresh() → sources 列表更新

上传成功
└─ reset form → router.refresh() → 显示 uploaded_document

扩展名不支持或超过 50MB
└─ SOURCE_UPLOAD_INVALID → error-state

对象存储或解析失败
└─ API 失败 → 表单保留页面 → pending=false

sourceId 不属于当前 Mission
└─ SOURCE_NOT_FOUND
~~~

## 6. 数据与资源流程

~~~text
URL
└─ mission_sources.url
   └─ sources.url + normalized_url
      └─ 当前不立即生成 Snapshot

文件 bytes
    ↓ sha256
S3 / MinIO object
    ↓ officeParser
extractedText
    ↓
source_snapshots
├─ http_status=200
├─ content_hash
├─ object_key
├─ extracted_text
└─ extraction_metadata(operation, mimeType)
~~~

## 7. 当前实现边界

~~~text
当前已实现
├─ URL 与 PDF/DOCX/XLSX/PPTX 上传入口
├─ 50MB 双层限制、对象哈希与内容寻址 Key
├─ Office 文本提取、Source/Snapshot 保存和列表刷新
└─ tenant / mission 过滤与 source.added.v1 事件

当前缺口
├─ SourceManager 的 URL UI 固定提交 manual_url，未暴露 website 选择
├─ URL 接入只登记 sources，不在该命令中抓取或生成 Snapshot
├─ storage.put() 与文档解析发生在数据库事务前；后续写库失败可能留下孤立对象
├─ 上传只按文件扩展名选择解析器，未交叉校验真实内容类型
└─ UI 只有 Source 列表，没有 Snapshot 历史入口

当前未确认
└─ 未连接对象存储或解析真实文件；Office 格式兼容、乱码和大文件耗时未实测
~~~

## 8. 一句话工程解释

~~~text
SourceManager 把公开 URL 登记为 Source，或把企业文件按哈希存入 S3、经 officeParser 提取文本并形成不可变 Snapshot，后续能力 Agent 再以这些来源作为证据输入
~~~

## 9. M1 实施与运行验收更新

模块状态：已验收（URL 路径）

URL Source Command 现在校验 HTTP(S)，调用 Browser Connector 抓取内容，写入 MinIO，upsert Source，并在同一业务事务中建立 Source Snapshot 和 `latestSnapshotId`。原“URL 只登记、不生成 Snapshot”的缺口已关闭。

验收 URL `https://example.com` 形成 Source `75a730a4-2f75-4e2e-85a0-fce43451417c`、Snapshot `f595ff0a-a138-43d8-8cc3-fd9d02ac56ef` 和 559-byte MinIO Object。本 Mission 最终共有 7 Sources、9 Snapshots 和 9 Objects。

本轮按 M1 核心链的“URL 或上传资料”选择 URL 路径；Office 文件类型、乱码与大文件耗时没有重复执行，仍保留为上传兼容性专项验收。
