# 数独 · App 版（Capacitor）

> 把网站 `index.html` 打包成**手机 App** 的工程。不用重写界面，网站代码直接被装进一个原生「外壳」里跑。
> 最终产物：**安卓 App（.apk / .aab）**，以及可选的 **iPhone App（.ipa，需 Mac 电脑）**。

---

## 一、你会得到什么

- 一个安卓手机上能安装、能用的 App，图标、启动页、界面都和网站一致。
- 数独核心逻辑纯前端运行，**没网也能玩**；登录/同步走 Supabase，需要网络。
- 网站改了之后，重新跑同步命令就能更新 App 里的页面。

---

## 二、开始前要准备的东西（一次性）

| 需要 | 说明 | 下载/入口 |
|------|------|-----------|
| **Node.js ≥ 24** | 跑打包命令用的运行环境 | https://nodejs.org （选 LTS 最新版） |
| **Git** | 一般你已经有了 | https://git-scm.com |
| **安卓：Android Studio** | 用来编译和导出安卓安装包 | https://developer.android.google.cn/studio （国内镜像） |
| **iPhone（可选）：Mac 电脑 + Xcode** | 苹果只允许在 Mac 上编 iOS，且需 $99/年 开发者账号 | Mac App Store 搜 Xcode |

> 🌏 国内网络提醒：`developer.android.com`、`dl.google.com`、`registry.npmjs.org` 等国际域名常被墙/慢，处理方案见文末「附」。

---

## 三、打包安卓 App

```bash
cd app
npm install                 # 第一次
npm run sync                # 把网站资源复制到 app/www/
npm run cap:add:android     # 生成安卓工程（只做一次）
npx cap sync                # 同步资源进安卓工程
npx cap open android        # 打开 Android Studio
```

然后在 Android Studio 里：
1. 顶部菜单 **Build → Generate App Bundles or APKs → Build APK(s)**
2. 编完右下角点 **locate**。
3. APK 在：`app/android/app/build/outputs/apk/debug/app-debug.apk`
4. 拷到安卓手机上安装（手机提示「允许安装未知来源应用」时同意）。

> 如果之前已 `npx cap add android`，单独打补丁：`npm run patch:android`

---

## 四、打包 iPhone App（可选，需 Mac）

```bash
cd app
npm install
npm run sync
npx cap add ios
npx cap sync
npx cap open ios
```

在 Xcode 里：选真机或模拟器 → **Product → Archive** 出包；上架走 **Organizer → Distribute App**。

---

## 五、图标

App 图标源图：`app/resources/icon.png`（1024×1024）。

```bash
cd app
npm install -g cordova-res                          # 一次性
npx cordova-res capacitor --skip-config --copy      # 生成各平台尺寸
npx cap sync
```

PWA 与 App 图标共用同一套视觉，由根目录统一生成：
```bash
npm run gen:icons
```

---

## 六、常见问题

| 现象 | 处理 |
|------|------|
| `npm install` 卡住 | 切淘宝镜像：`npm config set registry https://registry.npmmirror.com` |
| `npx cap` 找不到命令 | 确认在 `app/` 目录且 `npm install` 已完成 |
| Android Studio 首次打开转很久 | 在下载 Gradle/SDK，正常现象 |
| 首次启动弹窗 "Unable to access Android SDK add-on list" | 点 **Cancel**，进 IDE 后 `SDK Manager → SDK Update Sites` 换清华/中科大镜像 |
| Gradle/AGP 版本报错 | 跑 `npm run patch:android` 自动升级并注入国内镜像 |
| App 打开白屏 | 检查手机能否访问 Supabase（登录/同步才需要） |

---

## 附：国内网络处理

- **Android Studio 下载**：用 https://developer.android.google.cn/studio；若仍卡，用迅雷/IDM 多线程。
- **npm 源**：`npm config set registry https://registry.npmmirror.com`
- **Gradle/SDK 国内镜像**：`npm run patch:android` 已自动注入阿里云镜像；长时间卡住可换手机热点。
- **SDK Update Sites 镜像**：
  - 清华：`https://mirrors.tuna.tsinghua.edu.cn/android/repository/`
  - 中科大：`https://mirrors.ustc.edu.cn/android/repository/`
