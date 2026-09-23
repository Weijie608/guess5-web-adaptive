# Guess Five Adaptive · 第二版模型

这是现有网站的模型升级版，可直接用于 `Weijie608/guess5-web-adaptive` 仓库。继续使用原有界面、六档难度和操作方式，所有计算在浏览器中完成。

## 这次更新

网站现在使用 `guess5/predict/v2/models/portable_model.json` 的原样副本，包含已选定的三个网络 `response11 / response29 / response47`。每个网络结构为 **192→64→32→7**，使用 **256 个确定性探测猜测**，平均三个网络的类别概率后预测剩余成功次数。

采用第二版 Python API 的默认口径：**网络集成＋已有的证明规则**，对应整局评估报告中的 `v2_guarded`。包括可证明的探测上界、已知五数字集合的容量下界、120 个全排列的精确值和已证明的完整反馈集合。这些规则同样移植到浏览器，不在用户猜测时进行最优搜索。

运行时必须同时更新以下五个文件，不能只替换权重：

- `model.json`：第二版三个网络的权重和配置。
- `engine.js`：192 维特征、集成推理、证明规则。
- `numpy-random.js`：支持第二版探测所需的抽样规模。
- `worker.js`：新版模型加载与后台计算。
- `sw.js`：新版程序和模型的离线缓存。

本次缓存版本已经更新为 `v2-model-20260922`。旧游戏标签页关闭后才切换版本，避免一局中途混用两版程序。没有重新训练模型，没有修改 `guess5` 中的模型、策略或结果。

## 你接下来只需上传和发布

1. 打开现有仓库 [Weijie608/guess5-web-adaptive](https://github.com/Weijie608/guess5-web-adaptive)，进入存放现有 `index.html` 的目录。
2. 选择 **Add file → Upload files**。把本次发布包 `guess5_web_adaptive_v2.zip` 解压后，上传其中的全部文件，覆盖同名文件。也可以从本目录至少上传上述五个运行文件，并同步更新本 README。**不要上传 ZIP 本身，也不要在现有网页目录外再套一层文件夹。** 上传界面见 [GitHub 官方说明](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)。
3. 将这一组更新放在同一次提交中，提交到网站实际使用的发布分支；如果创建了新分支或拉取请求，合并到发布分支后再发布。提交说明可写 `Upgrade adaptive estimator to V2`。
4. 保留仓库现有的 Pages 发布设置。如果 Pages 从该分支自动发布，提交后等待部署完成；如果使用已有 Actions 工作流，按该工作流发布。在 **Actions** 查看部署结果，再从 **Settings → Pages** 的链接打开网站。[发布来源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
5. 旧用户首次打开时，可能先看到缓存的旧版。保持联网等待新版资源下载，然后**关闭这个游戏的所有标签页，再重新打开**。也可用新的无痕窗口直接检查新版本。

发布包中所有网页文件直接放在 ZIP 根目录。`tests/`、`release/` 和训练目录不需要上传。网站无需构建、后端、数据库、API Key 或 npm 安装。

此次只完成了本地修改、验证和打包，没有上传 GitHub 或执行公开发布。

## 本机查看

双击 `Start preview.cmd`，按其提示在浏览器中查看。也可在已安装 Python 3 的环境运行：

```powershell
python serve.py --open
```

默认地址为 `http://127.0.0.1:8000/`。如果端口占用，使用 `python serve.py --port 8001 --open`。不要直接双击 `index.html`：网页模块和后台线程需要 HTTP/HTTPS 环境。公开网页的玩家不需要 Python。

所有资源使用相对路径，已在 `/guess5-web-adaptive/` 子路径验证，可用于 GitHub Pages 项目站点。

## 游戏规则

- 六档：−2、−1、0、1、2、4，默认 0（Classic）。首次有效猜测前选择，本局锁定。
- 输入五位互不重复的 ASCII 数字，允许首位为 0，可以猜任意合法数字串。
- r 表示数字和位置均正确，s 表示共有数字数，包含 r。
- 只有实际得到 5r5s 才成功。其他反馈即使只剩一个候选，也还需要最后一次猜测。
- 只显示反馈和本局猜测历史，不显示候选集合或大小。
- New game 或刷新清空本局；没有账号、统计、存档、追踪或远程推理。
- Reveal an answer 结束本局，显示一个符合全部历史反馈的答案。
- 首次联网加载和离线缓存完成后，可以离线游玩；缓存只保存程序与模型，不保存猜测。

每个合法回答的权重仍为 `|S_g,a| × 2^(λH)`。胜利分支 H=0，非胜利单元素 H=1，大小为 2 时 H=2；其他集合使用第二版预测及证明规则，保留小数。采用对数平移归一化，游戏随机性来自浏览器 `crypto.getRandomValues`。

λ=0 不需要运行网络，直接按桶大小抽样，与均匀随机固定 secret 的反馈分布一致。难度只是改变合法回答的概率；候选过滤始终精确。六档在已测三种固定策略上保持均值递增，不保证任意玩家策略或任意单局都严格有序。

## 验证结果

- 158 个 Python 第二版对照集合：全部探测索引、192 维特征和证明上下界一致，特征最大误差为 0。
- 默认推理 H 的最大差约 `3.59e-7`；10 组完整分桶、六档回答概率的最大差约 `4.46e-8`。
- 六档完整对局的每次反馈均独立核对；验证重复猜测、候选集合外猜测、胜利和单元素语义。
- 网页实际加载了第二版；测试 1280px、390px、320px 布局、难度锁定、重复提交、揭晓、刷新清空和模型加载失败。
- 完整验证旧版缓存 → 新版缓存：旧局继续使用旧版，关闭最后一个旧标签页后启用新版，旧缓存移除、无关缓存保留，新版可离线游玩。

本次浏览器验证使用 Windows 上的 Chrome；手机尺寸通过浏览器模拟，未在实体 iPhone/Safari 上测试。

开发时运行：

```text
node --test tests/engine.test.js
```

无需 npm 安装。`tests/reference.json` 保存 Python 对照数据；安装有原 Python 依赖且保留相邻训练目录时，可用 `python -B tests/build_reference.py` 重新生成。它只写网站测试目录，不修改训练文件。

`tests/browser.cjs` 使用 Playwright，可通过 `TEST_BASE_URL`、`PLAYWRIGHT_MODULE`、`BROWSER_PATH` 指定环境。`tests/upgrade.cjs` 还需要 `OLD_SITE_ROOT` 指向旧版网页备份。详细结果见 `tests/parity-results.json`、`tests/browser-results.json`、`tests/upgrade-results.json` 和 `tests/manifest.json`。

`numpy-random.js` 中使用的第三方算法及许可证见 `THIRD_PARTY_NOTICES.txt`。以后更新程序或权重时，需要同时更新 `sw.js` 的缓存版本；本次已经处理。
