/**
 * 插件包完整性校验的纯逻辑（05 台账 T1.5）。
 *
 * 为什么必须有：
 *   远程插件的 `main.html` 是**从市场源直接下载并执行**的代码。
 *   没有哈希校验时，源被劫持 / 传输被篡改 / 源本身被替换，
 *   用户装到的就是**别人写的代码**，而界面不会显示任何异常。
 *   台账 T1.5 的验收标准是：「installer 下载 main.html 后计算 SHA-256，
 *   与 `/list` entry 的 `sha256` 字段比对；不一致拒绝安装」。
 *
 * 降级条款（台账「兼容/回滚」明确写了）：
 *   「旧市场源不提供 sha256 字段时，降级为『警告但不阻断』（灰度期），后续强制。」
 *   ⇒ 源没给哈希时**不阻断安装**，但必须**如实标记为未校验**，
 *     绝不能假装验过了（那才是另一种形式的谎报）。
 *
 * 哈希必须算在**文件字节**上：
 *   同一个文件先 `resp.text()` 再 `TextEncoder().encode()` 重新编码，
 *   得到的字节可能与原始字节不同（编码嗅探/BOM/非法序列）⇒ 哈希会不一样。
 *   所以调用方必须直接拿 `arrayBuffer()` 的字节来算。
 */

/** 计算字节的 SHA-256，返回小写十六进制 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("当前环境没有 Web Crypto（crypto.subtle 不可用），无法校验插件包");
  }
  // digest 需要一个完整的 ArrayBuffer 视图（Uint8Array 的子视图会让偏移算错）
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const digest = await subtle.digest("SHA-256", view);
  const arr = new Uint8Array(digest);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * 归一化市场源给的哈希串：去空白、转小写、允许 `sha256:` 前缀。
 * 非法字符一律剔除（有些源会带空格或换行）。
 */
export function normalizeHash(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (s.startsWith("sha256:")) s = s.slice("sha256:".length);
  s = s.replace(/[^0-9a-f]/g, "");
  return s;
}

export interface HashVerification {
  /** 是否**确实验证通过**。源没给哈希时为 false（不阻断，但要如实标记） */
  verified: boolean;
  /** 实际算出的哈希（小写十六进制） */
  actual: string;
  /** 人类可读的原因：verified 为 true 时是「一致」 */
  reason: string;
  /** 是否应当阻断安装 */
  blocking: boolean;
}

/**
 * 校验下载到的字节与市场源声明的哈希是否一致。
 * - 源给了哈希：不一致 ⇒ verified=false 且 blocking=true（拒绝安装）
 * - 源没给哈希：verified=false、blocking=false（按降级条款放行，但标记未校验）
 */
export async function verifyPluginHash(
  bytes: Uint8Array,
  expected: string | undefined | null,
): Promise<HashVerification> {
  const actual = await sha256Hex(bytes);
  if (expected === undefined || expected === null || !String(expected).trim()) {
    return {
      verified: false,
      actual,
      reason: "市场源未提供 sha256，按降级条款放行（本次未做完整性校验）",
      blocking: false,
    };
  }
  const want = normalizeHash(String(expected));
  if (!want || want.length !== 64) {
    return {
      verified: false,
      actual,
      reason: `市场源给的 sha256 格式非法（${String(expected).slice(0, 32)}），按降级条款放行`,
      blocking: false,
    };
  }
  if (want !== actual) {
    return {
      verified: false,
      actual,
      reason: `完整性校验失败：期望 sha256=${want}，实际=${actual}`,
      blocking: true,
    };
  }
  return { verified: true, actual, reason: "完整性校验通过", blocking: false };
}
