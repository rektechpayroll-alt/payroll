import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { el, serialize } from "./xml";

const hasXmllint = (() => {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("canonical XML builder", () => {
  it.skipIf(!hasXmllint)("matches xmllint --c14n exactly", () => {
    const doc = el("Body", { xmlns: "http://www.govtalk.gov.uk/CM/envelope", b: 'x"y', a: "1\t2" }, [
      el("Name", ["Tom & \"Jerry\" <Ltd> O'Neil\r"]),
      el("Empty"),
      el("N", { Type: "generic" }, "0"),
    ]);
    const xml = serialize(doc);
    const dir = mkdtempSync(join(tmpdir(), "c14n-"));
    writeFileSync(join(dir, "in.xml"), xml);
    const canon = execFileSync("xmllint", ["--c14n", join(dir, "in.xml")]).toString();
    expect(xml).toBe(canon);
  });
});
