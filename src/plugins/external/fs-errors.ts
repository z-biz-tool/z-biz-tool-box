/**
 * 插件目录读取失败的两类含义（台账 T3.6 / 交互契约四·3）。
 *
 * 「目录还不存在」是正常空态（用户没装过外部插件）；
 * 「权限不足 / IO 失败」不是空态，必须向上抛，让界面显示可行动的错误。
 * 旧实现一律 `catch { return [] }`，把后者伪装成「还没有插件」。
 *
 * 判据用 Rust / 各平台 fs 错误的常见文案：ENOENT 在 macOS 是
 * "No such file or directory (os error 2)"，Windows 是
 * "The system cannot find the path specified." 一类。
 */
export function isDirectoryMissingError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  return /no such file or directory|not found|os error 2|cannot find the (file|path)|does not exist|系统找不到指定的(文件|路径)/i.test(
    raw
  );
}
