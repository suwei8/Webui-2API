# Webui-2API

将 Google Gemini Web 转换为支持 OpenAI 格式的本地 API 服务。

本项目通过自动化控制 Chromium 浏览器与 `gemini.google.com` 交互，对外提供一个兼容 OpenAI `/v1/chat/completions` 的 HTTP 接口。

## 功能特性

- **OpenAI 兼容**: 支持标准的 `/v1/chat/completions` 接口调用。
- **本地运行**: 数据直接在本地浏览器与 Google 服务器交互。
- **自动桥接**: 自动接管已登录的 Chromium 浏览器会话。
- **智能等待**: 针对网络延迟优化的响应等待机制，支持流式输出的最终结果提取。
- **安全**: 默认仅绑定 `127.0.0.1`，防止外部未经授权的访问。

## 环境要求

- **操作系统**: Linux (已在 Oracle Linux A1 / Ubuntu 20.04 ARM64 测试通过)
- **Node.js**: v18+
- **浏览器**: Chromium (Snap 版本或系统原生版本)
- **账号**: 必须在 Chromium 中预先登录 Google Gemini。

## 安装与配置

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置说明**
   本项目设计为使用 Snap 版 Chromium。如果您的浏览器路径不同，请修改 `src/browser.js` 中的 `CHROMIUM_PATH` 和 `USER_DATA_DIR`。

## 启动服务

```bash
# 后台启动
./start_server.sh > server.log 2>&1 &
```

服务默认运行在 `http://127.0.0.1:3040`。

## 使用方法

使用任何支持 OpenAI API 的客户端（如 curl, Python openai 库等）：

```bash
curl -X POST http://127.0.0.1:3040/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "你好，Gemini！"
      }
    ]
  }'
```

### 注意事项

- **浏览器窗口**: 启动后会弹出一个 Chromium 窗口（或接管现有窗口）。**请勿关闭此窗口**，否则服务将无法工作。
- **登录状态**: 首次运行时，请确保浏览器已登录 Google 账号。如果未登录，请在弹出的窗口中手动登录。
- **端口安全**: 服务仅监听本地回环地址。如需远程访问，请使用 SSH 隧道或反向代理（Nginx）。

## 目录结构

- `src/server.js`: API 服务器入口。
- `src/browser.js`: 浏览器自动化控制逻辑。
- `src/gemini.js`: Gemini 网页交互核心逻辑。
- `start_server.sh`: 启动脚本。
- `test_api.sh`: 测试脚本。
- `debug_gemini.js`: 调试 Gemini 交互脚本。
- `debug_response.js`: 调试 API 响应脚本。
