import { test } from "node:test";
import assert from "node:assert/strict";
import { isDirectoryMissingError } from "../src/plugins/external/fs-errors.ts";

test("ENOENT 一类文案判为「目录不存在」", () => {
  assert.equal(isDirectoryMissingError("No such file or directory (os error 2)"), true);
  assert.equal(isDirectoryMissingError("ENOENT: no such file or directory"), true);
  assert.equal(isDirectoryMissingError(new Error("path does not exist")), true);
});

test("Windows 文案也判为不存在", () => {
  assert.equal(
    isDirectoryMissingError("The system cannot find the path specified. (os error 3)"),
    true
  );
  assert.equal(isDirectoryMissingError("系统找不到指定的路径。"), true);
});

test("权限不足 / IO 错误不能当空态", () => {
  assert.equal(isDirectoryMissingError("Permission denied (os error 13)"), false);
  assert.equal(isDirectoryMissingError("Access is denied. (os error 5)"), false);
  assert.equal(isDirectoryMissingError(new Error("I/O error: device not ready")), false);
});

test("非字符串/空值不误判", () => {
  assert.equal(isDirectoryMissingError(null), false);
  assert.equal(isDirectoryMissingError(undefined), false);
  assert.equal(isDirectoryMissingError({ code: "ENOENT" }), false);
});
