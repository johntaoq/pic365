# 自有会员系统迁移规划

## 目标

将当前依赖 Supabase 的注册会员、积分、生图记录和云保存能力迁移到自有后端。当前先使用 SQLite 本地开发，后续在 Azure VM 上使用 PostgreSQL；图片正式环境使用 Azure Blob Storage，同时保留现有 GPT-Image-2 / UniKeyX 调用方式。

这里的“会员”指注册账户，不包含付费订阅套餐。付费部分只保留为后续的积分包支付适配器。

## 权限模型

| 用户状态 | 生图权限 | 参数 | 云保存 | 下载 |
|---|---|---|---|---|
| 游客 | 1 次 | low、1024×1024 | 否 | 否 |
| 已注册、积分为 0 | 不开放完整画布 | - | 否 | 否 |
| 已注册、积分大于 0 | 完整画布 | low/medium、多尺寸 | 是 | 是 |
| 管理员 | 完整画布 | 按管理员策略 | 是 | 是 |

游客限制由服务端 HttpOnly Cookie 控制；浏览器端右键禁用只属于体验层防护，不能替代服务端权限判断。

## 自有系统组件

### 1. 认证服务

- `users`：用户资料、状态、角色、积分余额摘要
- `user_identities`：邮箱、Google、Watcha 等登录方式的外部身份映射
- `sessions`：只保存会话哈希，不保存明文令牌
- `auth` API：注册、登录、退出、刷新、当前用户
- 密码使用 Argon2id 或 bcrypt；Cookie 使用 HttpOnly、Secure、SameSite=Lax

### 2. 账户和积分服务

- `credit_ledger`：所有赠送、购买、消耗、退款、管理员调整记录
- `credit_reservations`：生图前预扣，成功后完成，失败后返还
- 余额扣减必须在数据库事务内完成，并使用行锁或原子更新防止并发超扣
- 不能只相信前端传入的积分余额、价格、用户角色或下载权限

### 3. 生图服务

- `POST /api/generate-image`
- 服务端检查游客 Cookie 或登录会话
- 已注册用户检查积分并创建 reservation
- 调用 UniKeyX 的 GPT-Image-2 Base URL 和 API Key
- 注册用户写入 `generations`；游客不写用户历史
- 失败时释放 reservation，成功时完成 reservation

### 4. 图片存储

- 本地开发使用 `data/generated/`，便于不依赖云服务完成联调
- 本地可用 Azurite 模拟 Azure Blob，容器仍使用 `generated-images`
- Azure 部署使用私有 Blob 容器 `generated-images`
- 数据库只保存 `storage_key`，不保存长期公开下载链接
- 注册用户下载时由后端鉴权后读取图片；后续可切换为短时签名 URL
- 游客结果只返回当前请求使用的临时图片地址，不进入云存储

### 5. 支付服务

- `credit_products`：积分包商品
- `payment_orders`：订单状态机
- `payment_events`：支付宝、微信或 Stripe 回调的幂等事件
- 支付成功必须由服务端回调确认，再写入 `credit_ledger`
- 前端跳转成功页不能直接增加积分

## 建议数据库表

```text
users
user_identities
sessions
credit_ledger
credit_reservations
generations
user_favorites
credit_products
payment_orders
payment_events
storage_objects
admin_audit_logs
```

关键字段：

- `users.id`, `users.email`, `users.role`, `users.status`, `users.created_at`
- `credit_ledger.user_id`, `amount`, `type`, `source`, `reference_id`, `metadata`, `created_at`
- `credit_reservations.user_id`, `amount`, `status`, `generation_id`, `expires_at`
- `generations.user_id`, `prompt`, `model`, `size`, `quality`, `status`, `provider_request_id`, `storage_key`
- `payment_events.provider`, `event_id`, `payload_hash`, `processed_at`，并建立唯一索引

## Supabase 到自有系统的对应关系

| 当前 Supabase 能力 | 自有系统替代 |
|---|---|
| Supabase Auth | `users` + `user_identities` + `sessions` + 自有 Auth API |
| `profiles` | `users` |
| `credit_transactions` | `credit_ledger` |
| `generation_reservations` | `credit_reservations` |
| `generations` | 自有数据库 `generations` |
| Supabase Storage | Azure Blob Storage；本地开发使用磁盘 |
| RPC 预扣与返还 | 后端事务服务 `creditService` |
| RLS | 后端鉴权、中间件和 SQL 权限控制 |
| Stripe Webhook | `payment_events` + 支付渠道适配器 |

## 推荐迁移顺序

1. 本地使用 SQLite 建立自有数据库和迁移层。
2. 先迁移 `users`、`sessions`、`credit_ledger` 和 `credit_reservations`。
3. 将 `/api/me`、`/api/generations`、`/api/generate-image` 切换到自有服务接口。
4. 本地使用磁盘存储验证完整链路，再接入 Azure Blob Storage。
5. 部署到 Azure VM，先运行 SQLite 版本完成小范围验证。
6. 在 Azure VM 上准备 PostgreSQL，执行 SQLite 到 PostgreSQL 的结构和数据迁移。
7. 迁移收藏、后台统计和管理员调整功能。
8. 最后迁移积分包支付和支付回调，并执行双写/对账后切流。
9. 验证无误后，移除 `@supabase/supabase-js`、Supabase API 路由和相关环境变量。

## 当前已确定的技术选择

- 本地数据库：SQLite
- 生产数据库：Azure VM 上的 PostgreSQL
- 生产部署：Azure VM + Docker
- 图片存储：本地开发使用磁盘，生产使用 Azure Blob Storage
- 登录方式：邮箱和密码；Google/Watcha 暂不作为第一阶段依赖
- AI 提供方：UniKeyX 的 GPT-Image-2 Base URL 和 API Key

## 当前实现状态

- 已完成游客一次性 low、1024×1024 生图限制
- 已完成游客结果图的右键菜单和拖拽体验层保护；服务端仍是最终权限边界
- 已完成本地 SQLite 的用户、会话、积分流水、积分预扣、生成记录和收藏基础表
- 已完成邮箱注册、登录、退出和当前会话 API
- 已完成本地图片存储，并加入 Azure Blob Storage 适配器
- 已完成 Azure VM 的 Docker 构建骨架
- 后台统计、管理员积分调整、支付回调和旧 Supabase 兼容模块仍需后续迁移

## 你需要配合的步骤

### 第一步：本地验证

你只需要在本机配置新的 UniKeyX API Key，并启动项目。不要把 Key 发到聊天中；之前在聊天里暴露过的 Key 应当先撤销并重新生成。

```powershell
cd D:\Wanqiang\lab\awesome-gpt-image-2
$env:AI_BASE_URL="https://www.unikeyx.com"
$env:AI_API_KEY="替换成新的密钥"
$env:APP_DB_PATH="D:\Wanqiang\lab\awesome-gpt-image-2\data\app.sqlite"
$env:LOCAL_STORAGE_ROOT="D:\Wanqiang\lab\awesome-gpt-image-2\data\generated"
npm run dev
```

然后打开创建页面，测试游客生图；再注册一个测试账户。你只需要反馈“游客是否成功、注册是否成功、登录后页面显示什么”，不要发送账户密码或 API Key。

### 第二步：准备 Azure VM

确定本地流程通过后，你需要创建一台 Ubuntu VM，准备 SSH 登录、公网 IP 和域名。安全组先只开放 SSH、HTTP、HTTPS；应用端口不直接暴露到公网，由 Nginx 反向代理。

### 第三步：准备 Azure Blob Storage

创建 Storage Account 和私有容器 `generated-images`。第一阶段可以在 VM 环境变量中配置连接字符串；正式运行后建议改为 VM 托管身份和最小权限访问。你只需要在 Azure 内配置，不要把连接字符串发到聊天中。

### 第四步：部署第一版

你提供 Azure VM 的公网 IP 和准备使用的域名即可，密码、私钥、连接字符串都不要发送。我会根据这些非敏感信息生成部署命令、环境变量模板和健康检查步骤。

### 第五步：迁移 PostgreSQL

第一版在 Azure VM 上稳定运行后，你再在 VM 或独立 Azure VM 上准备 PostgreSQL 数据库。你只需要提供数据库主机、端口、数据库名和用户名；密码由你在 VM 上自行设置。我会把 SQLite 迁移为 PostgreSQL 适配器并执行数据校验。

在 PostgreSQL 和 Azure Blob 完成验证前，SQLite 和本地磁盘仍保留为可回滚的开发路径，不影响当前本地联调。
