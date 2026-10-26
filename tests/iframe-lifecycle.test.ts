import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFrameLife,
  describeFramePhase,
  FRAME_TIMEOUT_MS,
  frameAlive,
  frameFailed,
  frameLoaded,
  frameTimedOut,
  isFrameBlocked,
  restartFrame,
} from "../src/plugins/external/iframe-lifecycle.ts";

test("初始相是 loading 且需要覆盖层", () => {
  const life = createFrameLife(1000);
  assert.equal(life.phase, "loading");
  assert.equal(life.errorMessage, null);
  assert.equal(isFrameBlocked(life.phase), true);
});

test("load 事件 → ready；ready 后覆盖层撤掉", () => {
  const life = frameLoaded(createFrameLife(1000));
  assert.equal(life.phase, "ready");
  assert.equal(isFrameBlocked(life.phase), false);
});

test("插件发消息也是 ready（比 load 更强的存活信号）", () => {
  const life = frameAlive(createFrameLife(1000));
  assert.equal(life.phase, "ready");
});

test("超时只在 loading 且超过阈值时触发", () => {
  const life = createFrameLife(1000);
  assert.equal(frameTimedOut(life, 1000 + FRAME_TIMEOUT_MS - 1).phase, "loading");
  assert.equal(frameTimedOut(life, 1000 + FRAME_TIMEOUT_MS).phase, "timeout");
});

test("没有 load、超时后仍无消息 ⇒ 停在 timeout，不允许再翻回 loading", () => {
  const life = frameTimedOut(createFrameLife(0), FRAME_TIMEOUT_MS);
  assert.equal(frameTimedOut(life, FRAME_TIMEOUT_MS * 5).phase, "timeout");
  assert.equal(isFrameBlocked(life.phase), true);
});

test("超时后晚到的 load / 消息可以恢复（加载慢不等于坏）", () => {
  const late = frameTimedOut(createFrameLife(0), FRAME_TIMEOUT_MS);
  assert.equal(frameLoaded(late).phase, "ready");
  const late2 = frameTimedOut(createFrameLife(0), FRAME_TIMEOUT_MS);
  assert.equal(frameAlive(late2).phase, "ready");
});

test("ready 之后不会因为定时器迟到而变成 timeout", () => {
  const ready = frameLoaded(createFrameLife(0));
  assert.equal(frameTimedOut(ready, FRAME_TIMEOUT_MS * 10).phase, "ready");
});

test("error 是终态：load 不会把它抹掉", () => {
  const failed = frameFailed(createFrameLife(0), "main.html 不存在");
  assert.equal(failed.phase, "error");
  assert.equal(failed.errorMessage, "main.html 不存在");
  assert.equal(frameLoaded(failed).phase, "error");
  assert.equal(frameTimedOut(failed, FRAME_TIMEOUT_MS * 10).phase, "error");
});

test("error 无原因时给可读默认文案，不出现空字符串", () => {
  assert.match(frameFailed(createFrameLife(0)).errorMessage ?? "", /加载失败/);
  assert.match(frameFailed(createFrameLife(0), "   ").errorMessage ?? "", /加载失败/);
});

test("重新加载重置计时起点并清掉错误", () => {
  const restarted = restartFrame(5000);
  assert.deepEqual(restarted, { phase: "loading", startedAt: 5000, errorMessage: null });
});

test("文案包含发生什么 + 能做什么，且不暴露内部字段", () => {
  const timeout = describeFramePhase("timeout");
  assert.match(timeout.title, /10 秒|加载/);
  assert.match(timeout.description, /重新加载|插件目录/);
  const error = describeFramePhase("error");
  assert.match(error.description, /main\.html|加载/);
  assert.equal(error.tone, "error");
  assert.equal(timeout.tone, "warning");
});
