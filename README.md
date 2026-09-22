# Guess Five Adaptive

一个可直接发布到 GitHub Pages 的静态网页游戏。沿用原版 Guess Five 的英文界面、配色和操作，增加六档难度。

## 使用

- 难度：−2、−1、0、1、2、4。默认 0（Classic）。
- 首次有效猜测前可以选择；首次有效猜测后，本局锁定。无效输入不会锁定或计次。
- 输入五位互不重复的 ASCII 数字，允许首位为 0，可以猜任何合法数字串。
- r 表示数字和位置均正确；s 表示共有数字数，包含 r。
- 只有 5r5s 才成功。只显示当前反馈和本局猜测历史，不显示候选集合或其大小。
- New game 清空本局，允许重新选择难度。刷新清空本局并恢复默认难度。
- Reveal an answer 结束本局，展示一个符合全部历史反馈的数字串，不声称它是开局固定的答案。
- 没有账号、统计、存档、追踪或远程推理。网站离线缓存只保存程序和模型，不保存猜测。

## 本机预览

Windows：双击 `Start preview.cmd`。脚本优先使用当前账户已有的 Codex Python，其次寻找 `py` 或 `python`；Python 仅用于提供本机静态文件服务。若没有 Python，可在已安装 Python 3 的环境运行以下命令。

```powershell
python serve.py --open
```

浏览器地址为 `http://127.0.0.1:8000/`。窗口保持打开；按 Ctrl+C 关闭预览。若端口占用，可用 `python serve.py --port 8001 --open`。

不要直接双击 index.html：网页使用浏览器模块与后台计算线程，需要 HTTP/HTTPS 环境。公开网页的玩家不需要安装 Python 或任何依赖。

## 上传 GitHub 并发布公开网页

推荐创建独立仓库，名称例如 `guess5-web-adaptive`。

1. 登录 GitHub，右上角 `+` → `New repository`。填写名称，选择 **Public**，勾选添加 README，然后创建仓库。GitHub Free 支持公开仓库的 Pages。
2. 打开仓库的 **Code** 页面，选择 **Add file → Upload files**。
3. 从本项目目录上传网站文件，或先解压交付的发布 ZIP，再上传解压后的**全部文件**。ZIP 不能直接作为网页发布。仓库根目录必须直接出现 `index.html`、`app.js`、`engine.js`、`worker.js`、`numpy-random.js`、`model.json` 等文件；不要再套一层 `guess5_web_adaptive` 文件夹。
4. 提交到 `main`。如果界面创建了新分支/拉取请求，需要合并到 `main` 后才能发布。
5. 打开 **Settings → Pages**。在 **Build and deployment** 中，将 **Source** 设为 **Deploy from a branch**，选择 **main** 和 **/ (root)**，点击 **Save**。
6. 等待 Pages 部署完成，可到 **Actions** 查看运行结果，再回到 **Settings → Pages** 点击 **Visit site**。项目网址格式为 `https://你的用户名.github.io/guess5-web-adaptive/`。
7. 用电脑和手机打开这个 HTTPS 网址，测试选难度、提交猜测、New game。首次联网加载并完成离线缓存后，可再次离线游玩。

网站无需构建命令、后端、数据库、API Key、自定义域名或 npm 安装。所有模块、模型、图标与样式均使用相对路径，支持 GitHub Pages 的仓库子路径。

如需继续使用原站相同账户 `weijie608`，且新仓库命名为 `guess5-web-adaptive`，对应网址将是 `https://weijie608.github.io/guess5-web-adaptive/`；以 GitHub Pages 设置页给出的实际地址为准。本次交付只创建本地网站和发布包，没有创建远程仓库或执行上传。

官方说明（核对日期：2026-09-21）：

- [创建新仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [通过浏览器上传文件](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [配置 Pages 发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 更新网站

修改文件后再次上传并提交到同一仓库即可触发 Pages 更新。**同时修改 sw.js 中的缓存版本**，例如把 `PREFIX+'v1'` 改成 `PREFIX+'v2'`，让浏览器重新缓存文件。

为避免一局中途混用新旧程序，更新会在旧游戏标签页全部关闭后生效。提交更新并等待部署成功后，关闭所有该游戏的标签页，再重新打开。排查旧缓存时，可使用浏览器无痕窗口。

## 模型与算法

`model.json` 是已有 `guess5/predict/models/model.json` 的原样副本，网络结构为 160→64→32→7，没有重新训练。

后台线程对当前候选集合按玩家的猜测精确分桶。每个非空回答 a 的权重为：

    |S_g,a| × 2^(λ × H)

5r5s 的 H=0；其他分支大小为 1/2 时 H=1/2；更大集合的 H 为网络预测类别分布的期望值，保留小数。概率使用对数平移归一化。

λ=0 可直接按桶大小抽样，与均匀随机固定 secret 的反馈分布相同。其他难度更偏向估计较难或较易的合法分支；不保证对每种玩家策略、每一局都严格增加或减少成功次数。

候选过滤始终精确；网络只影响合法回答的概率。游戏随机性使用浏览器 crypto.getRandomValues。特征中的确定性试探抽样独立使用兼容 NumPy 2.3.5 的 SeedSequence、PCG64 与不放回采样，复现原模型的 160 个输入特征。

## 开发验证

完整源码目录中执行 `node --test tests/engine.test.js`，无需 npm 安装。

- 92 个 Python 对照集合：全部试探索引与 160 维特征一致。
- 验证网络预测、普通模式、胜利与单元素语义、重复猜测和候选集合之外的猜测。
- 六档完整对局逐步独立核对历史反馈。
- 浏览器检查桌面、390px 和 320px 窄屏、难度锁定、输入校验、重复提交、揭晓、刷新清空、离线和模型加载失败。
- 测试结果保存在 `tests/`。发布 ZIP 仅包含网页和使用说明，不需要上传测试数据。

测试覆盖的浏览器为本机 Chrome，窄屏使用浏览器模拟；尚未在实体 iPhone/Safari 上验证。

`numpy-random.js` 使用的第三方算法与许可证见 `THIRD_PARTY_NOTICES.txt`。
