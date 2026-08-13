/**
 * 补丁：让 Capacitor 生成的 Android 工程兼容 JDK 21，并全面切换到国内镜像。
 *
 * 做三件事：
 *   1. Gradle wrapper  → 升级到 8.x 最新稳定版（自 8.4 起支持 JDK 21），下载源切腾讯云镜像。
 *   2. AGP             → 从 Capacitor 8 模板默认版本升级到与 Gradle / Android Studio 都兼容的版本。
 *   3. Maven 仓库      → 注入阿里云镜像（保留 google()/mavenCentral() 兜底），避免国内拉不到 AGP。
 *
 * 为什么 AGP 不像 Gradle 那样直接顶到最新：
 *   Gradle 由 wrapper 自动下载，不挑 IDE；但 AGP 版本会反过来要求 Android Studio 的最低版本，
 *   顶太高会导致 IDE 报 "This project requires a newer version of Android Studio" 直接打不开工程。
 *   所以这里会 **探测本机 Android Studio 版本**，取「Gradle 支持的上限」与「AS 支持的上限」的较小值。
 *
 * 为什么不上 AGP 9.x：
 *   AGP 9 要求 Gradle 9，且有大量破坏性变更（buildConfig 默认关闭、Transform API 移除等），
 *   Capacitor 8 生成的模板与其 Cordova 兼容层均未适配。故本脚本封顶在 AGP 8 系列最新稳定版（8.13.2），
 *   该版本满足 Capacitor 8 对 AGP ≥ 8.13.0 的要求。
 *
 * 用法：
 *   node scripts/patch-android-gradle.mjs              # 全自动
 *   GRADLE_VERSION=8.14.5 node scripts/...             # 固定 Gradle 版本
 *   AGP_VERSION=8.13.2    node scripts/...             # 固定 AGP 版本（跳过自动推断）
 *   STUDIO_PATH="D:/..."  node scripts/...             # 手动指定 Android Studio 安装目录
 *   NO_MIRROR=1           node scripts/...             # 不注入国内镜像（有梯子时用）
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const androidDir = path.resolve(__dirname, '../android');
const wrapperFile = path.join(androidDir, 'gradle/wrapper/gradle-wrapper.properties');
const rootGradleFile = path.join(androidDir, 'build.gradle');

// 8.x 最新版的兜底值（网络不可用时使用，查自 https://services.gradle.org/distributions/）
const FALLBACK_GRADLE = '8.14.5';

/**
 * AGP 兼容矩阵（官方 https://developer.android.google.cn/build/releases/gradle-plugin）
 * agp        : AGP 版本（取该小版本的最后一个 patch）
 * minGradle  : 该 AGP 要求的最低 Gradle 版本
 * minStudio  : 该 AGP 要求的最低 Android Studio 版本
 */
const AGP_MATRIX = [
  { agp: '8.2.1',  minGradle: '8.2',    minStudio: '2023.1.1' }, // Hedgehog
  { agp: '8.3.2',  minGradle: '8.4',    minStudio: '2023.2.1' }, // Iguana
  { agp: '8.4.2',  minGradle: '8.6',    minStudio: '2023.3.1' }, // Jellyfish
  { agp: '8.5.2',  minGradle: '8.7',    minStudio: '2024.1.1' }, // Koala
  { agp: '8.6.1',  minGradle: '8.7',    minStudio: '2024.1.2' }, // Koala FD
  { agp: '8.7.3',  minGradle: '8.9',    minStudio: '2024.2.1' }, // Ladybug
  { agp: '8.8.2',  minGradle: '8.10.2', minStudio: '2024.2.2' }, // Ladybug FD
  { agp: '8.9.3',  minGradle: '8.11.1', minStudio: '2024.3.1' }, // Meerkat
  { agp: '8.10.1', minGradle: '8.11.1', minStudio: '2024.3.2' }, // Meerkat FD
  { agp: '8.11.1', minGradle: '8.13',   minStudio: '2025.1.1' }, // Narwhal
  { agp: '8.12.3', minGradle: '8.13',   minStudio: '2025.1.2' }, // Narwhal FD
  { agp: '8.13.2', minGradle: '8.13',   minStudio: '2025.1.3' }, // Narwhal 3 FD（AGP 8 系列封顶）
];

// 探测不到 Android Studio 时的保守默认：Ladybug(2024.2.1) 起即可用，覆盖面最广
const SAFE_DEFAULT_AGP = '8.7.3';

const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/* ---------------- Gradle 版本 ---------------- */

async function fetchLatestGradle8() {
  try {
    const res = await fetch('https://services.gradle.org/distributions/');
    if (!res.ok) return FALLBACK_GRADLE;
    const html = await res.text();
    const matches = [...html.matchAll(/gradle-(8\.\d+(?:\.\d+)?)-all\.zip/g)].map((m) => m[1]);
    if (matches.length === 0) return FALLBACK_GRADLE;
    matches.sort(cmp);
    return matches[matches.length - 1];
  } catch {
    return FALLBACK_GRADLE;
  }
}

/* ---------------- Android Studio 探测 ---------------- */

/**
 * 从 product-info.json 提取版本。
 * 注意：新版 AS 的 version 字段形如 "AI-261.26222.65.2613.15948027"（内部构建号，不是年份版本），
 * 直接用宽松正则会误截出 "6222.65" 这种垃圾值。dataDirectoryName（"AndroidStudio2026.1.3"）才是
 * 稳定可靠的年份版本来源，故优先取它。
 */
function parseProductInfo(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const info = JSON.parse(fs.readFileSync(file, 'utf8'));
    const fromDataDir = String(info.dataDirectoryName || '').match(/AndroidStudio[^\d]*(\d{4}\.\d+(?:\.\d+)?)/);
    if (fromDataDir) return fromDataDir[1];
    // 退而求其次：只接受以 20xx 开头的年份版本，避免匹配到内部构建号
    const fromVersion = String(info.version || '').match(/\b(20\d{2}\.\d+(?:\.\d+)?)\b/);
    if (fromVersion) return fromVersion[1];
  } catch {
    /* 单个候选解析失败不影响后续探测 */
  }
  return null;
}

/** Windows：从注册表读取安装路径（最权威，不受安装盘符影响） */
function studioPathFromRegistry() {
  if (process.platform !== 'win32') return null;
  const keys = [
    'HKLM\\SOFTWARE\\Android Studio',
    'HKLM\\SOFTWARE\\WOW6432Node\\Android Studio',
    'HKCU\\SOFTWARE\\Android Studio',
  ];
  for (const key of keys) {
    try {
      const out = execSync(`reg query "${key}" /v Path`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const m = out.match(/Path\s+REG_SZ\s+(.+)/i);
      if (m) {
        const dir = m[1].trim();
        if (dir && fs.existsSync(dir)) return dir;
      }
    } catch {
      /* 该注册表项不存在，继续下一个 */
    }
  }
  return null;
}

/** 常见安装目录（覆盖多盘符、Toolbox、macOS、Linux） */
function candidateStudioDirs() {
  const dirs = [];
  const { LOCALAPPDATA, ProgramFiles, HOME, HOMEPATH } = process.env;

  if (process.platform === 'win32') {
    // 用户可能装在任意盘符，逐盘扫常见目录
    for (const drive of ['C:', 'D:', 'E:', 'F:']) {
      dirs.push(
        `${drive}/Program Files/Android/Android Studio`,
        `${drive}/Program Files (x86)/Android/Android Studio`,
        `${drive}/Android/Android Studio`,
        `${drive}/Programs/Android/Android Studio`,
      );
    }
    if (ProgramFiles) dirs.push(path.join(ProgramFiles, 'Android/Android Studio'));
    if (LOCALAPPDATA) {
      dirs.push(
        path.join(LOCALAPPDATA, 'Programs/Android Studio'),
        path.join(LOCALAPPDATA, 'Google/Android Studio'),
        path.join(LOCALAPPDATA, 'JetBrains/Toolbox/apps/AndroidStudio'),
      );
    }
  } else if (process.platform === 'darwin') {
    dirs.push('/Applications/Android Studio.app/Contents');
    const home = HOME || os.homedir();
    if (home) {
      dirs.push(
        path.join(home, 'Applications/Android Studio.app/Contents'),
        path.join(home, 'Library/Application Support/JetBrains/Toolbox/apps/AndroidStudio'),
      );
    }
  } else {
    dirs.push('/opt/android-studio', '/usr/local/android-studio', '/snap/android-studio/current');
    const home = HOME || HOMEPATH || os.homedir();
    if (home) dirs.push(path.join(home, 'android-studio'), path.join(home, '.local/share/JetBrains/Toolbox/apps/AndroidStudio'));
  }

  return dirs;
}

/** 在一个目录里找 product-info.json（兼容 macOS 的 Contents/Resources 与 Toolbox 的 ch-0/<build> 嵌套） */
function findProductInfo(dir) {
  if (!dir || !fs.existsSync(dir)) return null;

  const direct = [
    path.join(dir, 'product-info.json'),
    path.join(dir, 'Resources/product-info.json'),
    path.join(dir, 'Contents/Resources/product-info.json'),
  ];
  for (const f of direct) {
    if (fs.existsSync(f)) return f;
  }

  // JetBrains Toolbox：<dir>/ch-0/<build>/product-info.json
  try {
    for (const ch of fs.readdirSync(dir)) {
      const chDir = path.join(dir, ch);
      if (!fs.statSync(chDir).isDirectory()) continue;
      for (const build of fs.readdirSync(chDir)) {
        for (const f of [
          path.join(chDir, build, 'product-info.json'),
          path.join(chDir, build, 'Contents/Resources/product-info.json'),
        ]) {
          if (fs.existsSync(f)) return f;
        }
      }
    }
  } catch {
    /* 目录不可读则跳过 */
  }
  return null;
}

/**
 * 兜底：从用户配置目录名反推版本。
 * 只要 Android Studio 被启动过一次就会生成 AndroidStudio<版本> 目录，
 * 即便安装在非常规位置、或安装目录已被移动，这里通常仍能拿到版本。
 */
function studioVersionFromConfigDir() {
  const bases = [];
  const { APPDATA, LOCALAPPDATA, HOME } = process.env;
  const home = HOME || os.homedir();

  if (APPDATA) bases.push(path.join(APPDATA, 'Google'));
  if (LOCALAPPDATA) bases.push(path.join(LOCALAPPDATA, 'Google'));
  if (home) {
    bases.push(
      path.join(home, 'Library/Application Support/Google'), // macOS
      path.join(home, '.config/Google'),                     // Linux
      path.join(home, '.cache/Google'),
    );
  }

  const found = [];
  for (const base of bases) {
    try {
      if (!fs.existsSync(base)) continue;
      for (const name of fs.readdirSync(base)) {
        const m = name.match(/^AndroidStudio(\d{4}\.\d+(?:\.\d+)?)$/);
        if (m) found.push({ version: m[1], from: path.join(base, name) });
      }
    } catch {
      /* 目录不可读则跳过 */
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => cmp(a.version, b.version));
  return found[found.length - 1]; // 装了多个版本时取最新的
}

function detectStudioVersion() {
  // 1) 显式指定优先
  if (process.env.STUDIO_PATH) {
    const f = findProductInfo(process.env.STUDIO_PATH);
    const v = f && parseProductInfo(f);
    if (v) return { version: v, from: f, how: 'STUDIO_PATH' };
  }

  // 2) Windows 注册表（权威，不受盘符影响）
  const regDir = studioPathFromRegistry();
  if (regDir) {
    const f = findProductInfo(regDir);
    const v = f && parseProductInfo(f);
    if (v) return { version: v, from: f, how: '注册表' };
  }

  // 3) 常见安装目录
  for (const dir of candidateStudioDirs()) {
    const f = findProductInfo(dir);
    const v = f && parseProductInfo(f);
    if (v) return { version: v, from: f, how: '安装目录' };
  }

  // 4) 兜底：用户配置目录名反推
  const cfg = studioVersionFromConfigDir();
  if (cfg) return { version: cfg.version, from: cfg.from, how: '配置目录' };

  return null;
}

/* ---------------- AGP 版本决策 ---------------- */

function pickAgp(gradleVersion, studioVersion) {
  const usable = AGP_MATRIX.filter((e) => {
    if (cmp(gradleVersion, e.minGradle) < 0) return false;
    if (studioVersion && cmp(studioVersion, e.minStudio) < 0) return false;
    return true;
  });
  if (usable.length === 0) return null;

  const best = usable[usable.length - 1];
  // 探测不到 AS 时不敢顶到 Gradle 支持的上限，退回保守默认（但不低于当前已能用的）
  if (!studioVersion) {
    const safe = AGP_MATRIX.find((e) => e.agp === SAFE_DEFAULT_AGP);
    if (safe && cmp(best.agp, safe.agp) > 0) return safe;
  }
  return best;
}

/* ---------------- 执行 ---------------- */

if (!fs.existsSync(wrapperFile)) {
  console.error('未找到 android/gradle/wrapper/gradle-wrapper.properties');
  console.error('请先运行：npm run cap:add:android');
  process.exit(1);
}

const gradleVersion = process.env.GRADLE_VERSION || (await fetchLatestGradle8());
if (!/^8\.\d+(\.\d+)?$/.test(gradleVersion)) {
  console.error(`无效的 Gradle 版本号：${gradleVersion}`);
  process.exit(1);
}

// 1) Gradle wrapper
{
  const content = fs.readFileSync(wrapperFile, 'utf8');
  const url = `distributionUrl=https\\://mirrors.cloud.tencent.com/gradle/gradle-${gradleVersion}-all.zip`;
  fs.writeFileSync(wrapperFile, content.replace(/distributionUrl=.*/, url), 'utf8');
  console.log(`✅ Gradle  → ${gradleVersion}（腾讯云镜像）`);
}

// 2) AGP
const studio = detectStudioVersion();
if (studio) {
  console.log(`ℹ️  探测到 Android Studio ${studio.version}（来源：${studio.how}）`);
} else {
  console.log('ℹ️  未探测到 Android Studio，AGP 采用保守默认');
  console.log('   如已安装，可手动指定：STUDIO_PATH="安装目录" 或 AGP_VERSION=8.13.2');
}

let agpVersion = process.env.AGP_VERSION || null;
if (!agpVersion) {
  const picked = pickAgp(gradleVersion, studio?.version);
  if (!picked) {
    console.error(`没有与 Gradle ${gradleVersion}${studio ? ` + AS ${studio.version}` : ''} 兼容的 AGP，请手动指定 AGP_VERSION`);
    process.exit(1);
  }
  agpVersion = picked.agp;
}

if (!fs.existsSync(rootGradleFile)) {
  console.error('未找到 android/build.gradle');
  process.exit(1);
}

let root = fs.readFileSync(rootGradleFile, 'utf8');
const agpBefore = root.match(/com\.android\.tools\.build:gradle:([\d.]+)/)?.[1];

root = root.replace(
  /com\.android\.tools\.build:gradle:[\d.]+/,
  `com.android.tools.build:gradle:${agpVersion}`
);

if (agpBefore === agpVersion) {
  console.log(`✅ AGP     → ${agpVersion}（已是目标版本，无需变更）`);
} else {
  console.log(`✅ AGP     → ${agpVersion}（原 ${agpBefore ?? '未知'}）`);
}

// 3) 阿里云镜像仓库（保留官方源兜底，幂等）
if (process.env.NO_MIRROR === '1') {
  console.log('⏭️  已跳过国内镜像注入（NO_MIRROR=1）');
} else if (root.includes('maven.aliyun.com')) {
  console.log('✅ 仓库镜像 → 已存在阿里云镜像，跳过');
} else {
  const mirrors = [
    "        maven { url 'https://maven.aliyun.com/repository/google' }",
    "        maven { url 'https://maven.aliyun.com/repository/central' }",
    "        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }",
  ].join('\n');
  const count = (root.match(/repositories \{\s*\n\s*google\(\)/g) || []).length;
  root = root.replace(/repositories \{\s*\n(\s*)google\(\)/g, `repositories {\n${mirrors}\n$1google()`);
  console.log(`✅ 仓库镜像 → 已注入阿里云镜像 ${count} 处（google()/mavenCentral() 保留为兜底）`);
}

fs.writeFileSync(rootGradleFile, root, 'utf8');

const matched = AGP_MATRIX.find((e) => e.agp === agpVersion);
if (matched) {
  console.log('');
  console.log(`   AGP ${agpVersion} 要求：Gradle ≥ ${matched.minGradle}、Android Studio ≥ ${matched.minStudio}`);
}
console.log('');
console.log('👉 回到 Android Studio 点工具栏大象图标「Sync Project with Gradle Files」重新同步。');
