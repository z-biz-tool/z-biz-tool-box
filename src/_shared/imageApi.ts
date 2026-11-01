/**
 * 图片能力的统一调用面（前端侧）。
 *
 * ## 为什么要有这一层
 *
 * 后端命令按职责分成三组（截屏 / 元数据 / 像素编辑），前端各处直接
 * `invoke("xxx")` 会把命令名写得到处都是，改名就得全局搜。
 * 这里收成具名函数，调用方只关心「我要截屏」而不是「命令叫什么」。
 *
 * ## 边界：像素级的事不在这层做
 *
 * 前端**只做预览与交互**。滤镜、缩放、裁剪、编码全部由后端走
 * cap-img 完成 —— 预览可以用 CSS 滤镜（快、即时），但**导出必须走 Rust**，
 * 否则同一张图会因「预览路径」与「导出路径」不同而长得不一样。
 */
import { invoke } from "@tauri-apps/api/core";

/** 一块显示器 */
export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
  x: number;
  y: number;
}

/** 一个窗口 */
export interface WindowInfo {
  id: number;
  pid: number;
  appName: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isFocused: boolean;
}

/** 截屏结果：base64 的 PNG（无损） */
export interface ScreenshotData {
  data: string;
  width: number;
  height: number;
}

/** EXIF 值的类型 */
export type ExifValueKind =
  | "ascii"
  | "rational"
  | "short"
  | "long"
  | "byte"
  | "sbyte"
  | "sshort"
  | "slong"
  | "float"
  | "double"
  | "srational"
  | "undefined";

/** EXIF 的单个值 */
export type ExifValue =
  | { type: "text"; value: string }
  | { type: "int"; value: number }
  | { type: "rational"; value: string }
  | { type: "float"; value: number }
  | { type: "bytes"; value: string };

/** EXIF 的单个字段 */
export interface ExifField {
  name: string;
  tag: number;
  kind: ExifValueKind;
  display: string;
  values: ExifValue[];
}

/** 一个 IFD 的内容 */
export interface ExifIfd {
  fields: ExifField[];
}

/** EXIF 完整快照 */
export interface ExifData {
  primary: ExifIfd;
  exif: ExifIfd;
  gps: ExifIfd;
  thumbnail: ExifIfd;
  littleEndian: boolean;
}

/** 一次 EXIF 编辑 */
export interface ExifEdit {
  set: ExifField[];
  remove: string[];
}

/** 图片信息 */
export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
  exif: ExifData | null;
}

/** 缩略图结果（base64 PNG） */
export interface ImageThumbnail {
  data: string;
  width: number;
  height: number;
}

/** 滤镜名（与 cap-img 的 filter_impl 一一对应） */
export const FILTERS = [
  { key: "grayscale", label: "黑白" },
  { key: "sepia", label: "复古" },
  { key: "invert", label: "反色" },
  { key: "brightness", label: "提亮" },
  { key: "contrast", label: "增强对比" },
  { key: "blur", label: "模糊" },
  { key: "sharpen", label: "锐化" },
] as const;

/** 滤镜名类型 */
export type FilterName = (typeof FILTERS)[number]["key"];

// ---------------------------------------------------------------------------
// 截屏
// ---------------------------------------------------------------------------

/** 枚举显示器 */
export function listDisplays(): Promise<DisplayInfo[]> {
  return invoke<DisplayInfo[]>("list_displays");
}

/** 枚举窗口 */
export function listWindows(): Promise<WindowInfo[]> {
  return invoke<WindowInfo[]>("list_windows");
}

/** 截取整块显示器 */
export function captureDisplay(displayId: number): Promise<ScreenshotData> {
  return invoke<ScreenshotData>("capture_display", { displayId });
}

/** 截取主显示器 */
export function capturePrimaryDisplay(): Promise<ScreenshotData> {
  return invoke<ScreenshotData>("capture_primary_display");
}

/**
 * 截取显示器的某个区域。
 *
 * 坐标**相对该显示器左上角**（不是屏幕全局坐标）。
 */
export function captureRegion(
  displayId: number,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<ScreenshotData> {
  return invoke<ScreenshotData>("capture_region", { displayId, x, y, width, height });
}

/** 截取某个窗口 */
export function captureWindow(windowId: number): Promise<ScreenshotData> {
  return invoke<ScreenshotData>("capture_window", { windowId });
}

// ---------------------------------------------------------------------------
// 元数据
// ---------------------------------------------------------------------------

/** 读取图片信息 */
export function getImageInfo(path: string): Promise<ImageInfo> {
  return invoke<ImageInfo>("get_image_info", { path });
}

/** 读取 EXIF 完整快照 */
export function readExif(path: string): Promise<ExifData | null> {
  return invoke<ExifData | null>("read_exif", { path });
}

/** 写入 EXIF（在原有基础上改，不丢未知标签） */
export function writeExif(path: string, destPath: string, edit: ExifEdit): Promise<void> {
  return invoke<void>("write_exif", { path, destPath, edit });
}

/** 清除全部 EXIF */
export function stripExif(path: string, destPath: string): Promise<void> {
  return invoke<void>("strip_exif", { path, destPath });
}

/** 生成缩略图（base64 PNG） */
export function getImageThumbnail(path: string, maxSize: number): Promise<ImageThumbnail> {
  return invoke<ImageThumbnail>("get_image_thumbnail", { path, maxSize });
}

// ---------------------------------------------------------------------------
// 像素编辑（全部由后端 cap-img 完成）
// ---------------------------------------------------------------------------

/** 缩放 */
export function resizeImage(
  path: string,
  destPath: string,
  width: number,
  height: number
): Promise<void> {
  return invoke<void>("resize_image", { args: { path, destPath, width, height } });
}

/** 旋转（90/180/270） */
export function rotateImage(path: string, destPath: string, degrees: number): Promise<void> {
  return invoke<void>("rotate_image", { path, destPath, degrees });
}

/** 翻转 */
export function flipImage(
  path: string,
  destPath: string,
  horizontal: boolean
): Promise<void> {
  return invoke<void>("flip_image", { path, destPath, horizontal });
}

/** 裁剪 */
export function cropImage(
  path: string,
  destPath: string,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<void> {
  return invoke<void>("crop_image", { args: { path, destPath, x, y, w, h } });
}

/** 应用滤镜 */
export function applyFilter(
  path: string,
  destPath: string,
  filterName: string
): Promise<void> {
  return invoke<void>("apply_filter", { args: { path, destPath, filterName } });
}

/** 导出为指定格式 */
export function exportImage(
  path: string,
  destPath: string,
  format: string,
  quality: number
): Promise<void> {
  return invoke<void>("export_image", { args: { path, destPath, format, quality } });
}

/** 把 base64 的 PNG 数据转成 data URL（前端预览用） */
export function toDataUrl(base64: string, mime = "image/png"): string {
  return `data:${mime};base64,${base64}`;
}
