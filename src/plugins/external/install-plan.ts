/**
 * 安装前确认清单 — 用户点"安装"之后、**真正下载之前**要给他看的东西。
 *
 * ## 为什么要有这一步
 *
 * 插件是一个能在宿主里跑任意 JS 的包。它装上之后的实际能力 = 它的
 * `plugin.json` 声明的权限 ∩ 宿主的白名单。用户在市场列表里看到的
 * 一行"插件名 + 一句描述", 完全没告诉他这个包将要:
 *  - 从哪个 URL 来(域名本身可能就是钓鱼)
 *  - 要哪些权限(读剪贴板? 发网络请求?)
 *  - 有没有完整性校验(hash 比对过没有)
 *
 * 所以台账 T1.7 要求: 展示插件名 / 来源 URL / 版本 / hash / 权限清单,
 * 用户确认后才开始下载。
 *
 * ## 本模块是纯逻辑
 *
 * 只负责**算**出该展示什么、哪些是风险; 不碰下载、不碰 UI。
 * 这样"确认清单里有没有漏掉权限"这类问题可以在 node 里直接断言,
 * 不需要起界面。
 *
 * ## 硬阻断 vs 警告
 *
 *  - **警告**(用户确认后可以继续): 市场源没给 sha256(台账的灰度降级条款)、
 *    源是 http、插件要敏感权限。
 *  - **硬阻断**(根本不该走到确认这一步): sha256 比对不一致。
 *    那条在 installer 里就已经抛错了, 清单里也会把它标成 blocking,
 *    双保险 —— 免得将来有人改成"确认后仍然安装"。
 */
import type { ExternalPluginManifest, MarketPluginEntry } from "./types.ts";

/** 权限名 → 人话 */
const PERMISSION_LABELS: Record<string, string> = {
  log: "写宿主日志",
  notify: "弹宿主通知",
  storage: "读写自己的私有存储",
  "clipboard.write": "写你的剪贴板",
  "clipboard.read": "读你的剪贴板（可能读到验证码/密码）",
  "window.control": "隐藏/显示/聚焦主窗口",
  http: "发起网络请求（可访问内网）",
  invoke: "调用宿主后端命令",
};

/** 权限 → 风险等级。敏感权限在确认清单里要单独标出来 */
const SENSITIVE_PERMISSIONS = new Set([
  "clipboard.read",
  "http",
  "invoke",
  "window.control",
]);

export interface InstallPlanInput {
  /** 市场列表里的条目 */
  entry: MarketPluginEntry;
  /** 已下载的 plugin.json(用来拿权限清单); 没拿到时按空权限算 */
  manifest?: ExternalPluginManifest | null;
  /** 市场源 base URL */
  sourceUrl: string;
  /** 市场源是否为 http(明文) */
  insecureSource?: boolean;
  /** 是否已经做过 sha256 比对 */
  hashVerified?: boolean;
}

export interface PlanLine {
  label: string;
  value: string;
}

export interface InstallPlan {
  pluginId: string;
  name: string;
  version: string;
  sourceUrl: string;
  /** 市场源声明的 sha256; 没有则是 null */
  sha256: string | null;
  /** 是否真的做过完整性校验 */
  hashVerified: boolean;
  /** 插件申请的权限(已去重、已排序) */
  permissions: string[];
  /** 敏感权限(需要用户在确认时重点看) */
  sensitivePermissions: string[];
  /** 展示行 */
  lines: PlanLine[];
  /** 风险提示(黄色) */
  warnings: string[];
  /** 硬阻断(红色, 出现即不应继续) */
  blocking: string[];
}

/** 权限清单的展示文本 */
export function describePermission(name: string): string {
  const label = PERMISSION_LABELS[name];
  return label ? `${name} — ${label}` : `${name} — 宿主未描述的能力`;
}

/**
 * 算出安装确认清单。
 *
 * ⚠️ 权限取自 **manifest**, 不是取自市场列表条目 —— 市场条目里没有权限字段,
 * 权限只存在于插件自己的 plugin.json 里。这正是"先取 manifest 再确认、
 * 确认后才下载主文件"这个顺序的理由。
 */
export function buildInstallPlan(input: InstallPlanInput): InstallPlan {
  const { entry, manifest, sourceUrl } = input;
  const insecureSource = input.insecureSource === true;
  const hashVerified = input.hashVerified === true;

  const name = manifest?.name || entry.name || entry.id;
  const version = manifest?.version || entry.version || "";
  const sha256 = entry.sha256 ?? null;

  // 权限: 先裁空白**再**去重, 最后排序。
  // 顺序很要紧: 先去重后裁空白的话, "log" 与 " log " 会先作为两个不同项通过去重,
  // 裁完空白就变成两个 "log" —— 清单里出现重复权限, 用户会以为插件申请了两次。
  const rawPerms = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  const permissions = [
    ...new Set(
      rawPerms
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    ),
  ].sort();
  const sensitivePermissions = permissions.filter((p) => SENSITIVE_PERMISSIONS.has(p));

  const lines: PlanLine[] = [
    { label: "插件名", value: name },
    { label: "插件 ID", value: entry.id },
    { label: "版本", value: version || "（未声明）" },
    { label: "来源 URL", value: sourceUrl },
    {
      label: "完整性校验",
      value: sha256
        ? hashVerified
          ? `SHA-256 已比对通过 (${shortHash(sha256)})`
          : `SHA-256 已声明但本次未校验 (${shortHash(sha256)})`
        : "市场源未提供 SHA-256 —— 本次安装不做完整性校验",
    },
  ];
  if (entry.author) lines.push({ label: "作者", value: entry.author });
  if (entry.homepage) lines.push({ label: "主页", value: entry.homepage });
  lines.push({
    label: "申请权限",
    value: permissions.length > 0 ? permissions.map(describePermission).join("\n") : "（无）",
  });

  const warnings: string[] = [];
  const blocking: string[] = [];

  if (!sha256) {
    warnings.push("市场源没有提供 SHA-256，本次安装无法校验包是否被篡改。");
  }
  if (insecureSource) {
    warnings.push("市场源是 http 明文源，内容可被中间人替换。");
  }
  if (sensitivePermissions.length > 0) {
    warnings.push(
      `该插件申请了敏感权限：${sensitivePermissions.join("、")}。装上后它将真的拥有这些能力。`,
    );
  }

  return {
    pluginId: entry.id,
    name,
    version,
    sourceUrl,
    sha256,
    hashVerified,
    permissions,
    sensitivePermissions,
    lines,
    warnings,
    blocking,
  };
}

/** sha256 只显示头尾, 避免确认弹窗被一长串 hex 撑爆 */
function shortHash(sha: string): string {
  if (sha.length <= 16) return sha;
  return `${sha.slice(0, 8)}…${sha.slice(-8)}`;
}
