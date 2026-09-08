# 项目协作指引

## 工作边界

- 行动前说明任务范围、交付产物、使用方、生命周期和文件管理方式。
- 以业务 Snapshot 为交付主轴，以可见、可控的原子业务能力组织开发；横向架构服务于业务实现与问题诊断，阶段进度按连续业务链评估。当前首个业务里程碑为 BM1：`Mission → Evidence → Route → Target → Contact → Opportunity → Action Card`，贯通后统一验收。
- 修改聚焦用户指定范围，测试与验证以用户明确授权为触发条件。
- `/docs` 面向用户编写，以中文为主，技术术语保留英文。

## 测试环境

项目服务运行在临时 Vultr 4 GB 开发服务器，本机通过 SSH Tunnel 访问。服务器从 Golden Snapshot 创建，测试结束后销毁以停止实例计费。

- 服务器状态：`%LOCALAPPDATA%\MarketEntryAgent\Vultr\state.json`
- SSH 私钥：`$env:USERPROFILE\.ssh\astsoso_vultr`
- 远端项目：`/opt/market-entry-agent`
- Compose：`docker-compose.devserver.yml`
- 环境配置：`/etc/market-entry-agent/devserver.env`
- 创建、销毁和更新 Golden Snapshot：使用 `market-entry-vultr-testserver` skill

本机入口：

- Web：`http://localhost:3000/login`
- API Ready：`http://localhost:4000/ready`
- Temporal UI：`http://localhost:8080`
- MinIO Console：`http://localhost:9001`
- PostgreSQL：`localhost:5432`

开发账号（`db:bootstrap` 保留此登录；完整演示数据需显式 `db:seed`）：

- Email：`owner@demo.local`
- Password：`Demo123!`
- Workspace：`Demo Industrial Workspace`

正常开发启动只执行 `postgres-bootstrap`，创建账号、工作区和成员关系；不默认写入演示 Mission、目标或行动卡。完整演示入口为 `pnpm db:seed`，远端为 `demo` profile 下的 `postgres-seed`，只在用户明确需要演示数据时执行。现有演示数据和业务记录保持原位。

## 最简单用法

测试前，在项目根目录启动 Tunnel，并保持窗口运行：

```powershell
.\scripts\devserver-tunnel.ps1
```

然后打开 `http://localhost:3000/login`。

本地代码需要部署时执行：

```powershell
.\scripts\devserver-sync.ps1
```

远端服务需要人工处理时，先读取当前 IP 再连接：

```powershell
$server = Get-Content (Join-Path $env:LOCALAPPDATA 'MarketEntryAgent\Vultr\state.json') -Raw | ConvertFrom-Json
ssh.exe -F NUL -i "$env:USERPROFILE\.ssh\astsoso_vultr" "deployer@$($server.mainIp)"
```

远端常用命令：

```bash
bash /opt/market-entry-agent/scripts/devserver-up.sh
bash /opt/market-entry-agent/scripts/devserver-restart.sh
bash /opt/market-entry-agent/scripts/devserver-logs.sh
```

测试结束后，让 Codex“销毁 4GB 测试服务器”。关机仍会计费，停止计费需要销毁实例。

## 当前状态与验收入口

当前进度、已验收范围、观察时间、证据和待办统一维护于 [当前状态与验收口径](docs/testing/README.md)。本文件只维护协作规则与操作入口，不复制会过期的运行状态。

Fixture 工程链、Provider 单项兼容性和 BM1 Live 业务验收分别记录；前两项通过不能替代 BM1 完整业务验收。历史报告保留当时的环境、结果和证据，不作为当前状态入口。

BM1 验收主链：创建 Live Mission → 形成企业证据 → 确认能力 → 批准路线 → 从 Top 10 选择 1–3 个目标 → 形成公开触达或研究 Action Card → 批准至少 1 张 → 核对驾驶舱与 ZIP。

详细计划和验收口径见 `docs/ChatGptPlan/BM1-业务纵向闭环计划.md`，测试清单见 `docs/testing/README.md`。
