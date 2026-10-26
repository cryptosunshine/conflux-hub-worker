# Conflux Copilot Worker

生态问答与导览的最小后端。原生 Worker + TypeScript，无数据库、Agent 框架或运行时依赖。

## 本地运行

使用 Node.js 22.18+ 和 pnpm：

```sh
pnpm install
# 首次配置；已有 .dev.vars 时不要覆盖
cp -n .dev.vars.example .dev.vars
pnpm dev
```

在 `.dev.vars` 中设置：

```dotenv
LLM_BASE_URL="你的服务地址，通常以 /v1 结尾"
LLM_MODEL="模型名称"
LLM_API_KEY="本地填写密钥"
```

接口采用兼容 OpenAI Chat Completions 的协议。Base URL 不含 `/chat/completions`。
密钥只在 Worker 读取，`.dev.vars` 已加入忽略规则，不传给浏览器。

前端在相邻的 `../conflux-hub`：运行 `pnpm dev`，打开 `http://127.0.0.1:5173/copilot`。
前端通过 Vite 代理访问 `http://127.0.0.1:8787`，默认不需要前端环境变量。

## 文件职责

- `src/index.ts`：路由、允许的浏览器来源、错误响应。
- `src/http.ts`：读取有限大小的 JSON，限制实际请求体为 64 KiB。
- `src/chat.ts`：消息校验、模型请求、30 秒超时、响应校验。
- `src/knowledge.ts`：模型使用的官方资料、范围约束，以及建议问题。

## API

`POST /api/copilot/chat`，Content-Type 为 `application/json`：

```json
{"messages":[{"role":"user","content":"Core Space 和 eSpace 有什么区别？"}]}
```

返回：

```json
{"reply":"Markdown 正文","suggestions":["有哪些生态应用？"]}
```

最多 20 条消息；user 内容最多 1,000 字符，assistant 内容最多 12,000 字符，最后一条必须为 user。
只接受 user / assistant 角色，system 指令由服务端设置。回复一次性返回 JSON，当前不做流式输出。

- 400 / 413 / 415：消息、请求大小或内容类型不符合约束。
- 503：模型配置未完成。
- 502 / 504：模型调用失败、响应无效或超时；不降级为模板回答。
- `GET /api/copilot/health`：进程健康检查，不代表模型凭据已验证。

## 验证

```sh
pnpm test
pnpm check
pnpm build  # Wrangler dry-run，不部署
```

更改环境字段后运行 `pnpm exec wrangler types --strict-vars=false`。类型生成依赖本地 `.dev.vars` 的键名。

本版本用于本地联调。对外开放前需要另行设计身份校验、调用额度与限流；`ALLOWED_ORIGINS` 只是浏览器跨域约束，不是认证。没有钱包资产查询、签名、交易或任务存储。
