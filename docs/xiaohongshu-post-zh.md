# Runbox 小红书发布文案

## 推荐标题

我把本地开发项目做成了一个启动台

## 正文

做的项目越来越多以后，我发现最混乱的地方经常不是代码，而是终端。

哪个标签页在跑前端？API 要用 npm、pnpm 还是 cargo？Worker 为什么突然停了？刚才那个服务到底占了哪个端口？

所以我做了一个 macOS 小工具：**Runbox**。

它会记住每个项目的目录和启动任务。以后不管是 Web、API 还是 Worker，都可以直接点一下启动或停止，不用再翻 README、找历史命令，或者在一排终端标签页里猜哪个进程还活着。

现在它可以：

- 一个项目配置多个任务，单独启动或一起运行；
- 给任务设置依赖关系，按顺序启动，前一个真正 Ready 后再继续；
- 支持进程、端口、HTTP 地址和日志关键字四种就绪检查；
- 启动前检测端口冲突，直接显示占用进程和 PID；
- 自动显示 localhost 地址和监听端口；
- 查看 CPU、内存、运行时间、实时日志和异常退出码；
- 把 Web、API、Worker 组合成 Workspace Group，一键拉起整套开发环境；
- 查看 Git diff 和提交历史，暂存、提交、切分支、拉取和推送；
- 从项目直接打开 Cursor、VS Code、Terminal、Finder 或远程仓库；
- 调整整体界面尺寸和主题，在 4K 显示器上也能看舒服；
- 在终端里输入 `p 项目名`，和桌面端共用同一套项目与运行状态。

它不是新的 IDE，也不是容器平台，更像是放在 Mac 上的一个“本地开发项目控制台”。Runbox 不接管项目环境，还是运行你原来使用的那些命令；关掉窗口以后，已经启动的进程也会继续运行。

目前是 0.3.0，这一版叫 **Reliable Workspaces**。使用 Tauri、Rust、React 和 TypeScript 开发，代码已放到 GitHub。还在持续完善，如果你也经常同时维护很多本地项目，很想听听你最希望它下一步解决什么问题。

GitHub：
https://github.com/siyuhuh/project-launcher

## 话题

#独立开发 #程序员工具 #开发者工具 #macOS软件 #开源项目 #GitHub #效率工具 #Rust #Tauri #React

## 备选标题

- 受够了一排终端，我做了 Runbox
- 同时跑 Web、API、Worker，可以简单一点
- 给本地开发项目做了一个控制台
- 不用再记每个项目怎么启动了

## 配图顺序建议

1. 首页全景：先让人理解这是一个项目工作台。
2. Tasks & Health：突出端口、CPU、内存和日志。
3. Workspace Groups：展示 Web、API、Worker 按顺序启动并等待 Ready。
4. Git History：展示它不只是启动器。
5. Preferences：展示 4K 缩放与主题。
