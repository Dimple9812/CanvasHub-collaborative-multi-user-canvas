import { createShape, duplicate, finalizeDraft } from "./shapes";
import { safeNext } from "./redirect";
import { initials, timeAgo } from "./format";

const style = { stroke: "#1c2433", fill: "#dbe4ff", strokeWidth: 2, fontSize: 24 };

describe("shape helpers", () => {
  it("gives a single click a usable default size", () => {
    const r = finalizeDraft(createShape("rect", style, 1, { x: 100, y: 100 }))!;
    expect([r.width, r.height]).toEqual([120, 80]);
    const line = finalizeDraft({ ...createShape("line", style, 1, { x: 0, y: 0 }), points: [0, 0, 1, 1] })!;
    expect(line.points).toEqual([0, 0, 120, 0]);
  });

  it("drops a pen stroke with a single point", () => {
    expect(finalizeDraft(createShape("pen", style, 1, { x: 0, y: 0 }))).toBeNull();
  });

  it("only fills shapes that have an area, and centres sticky notes on the click", () => {
    expect(createShape("line", style, 1, { x: 0, y: 0 }).fill).toBe("transparent");
    const sticky = createShape("sticky", style, 1, { x: 300, y: 300 });
    expect([sticky.x, sticky.y, sticky.fill]).toEqual([200, 220, "#ffd84d"]);
  });

  it("duplicates with fresh ids, an offset and copied points", () => {
    const src = { ...createShape("pen", style, 1, { x: 0, y: 0 }), points: [0, 0, 5, 5] };
    const [copy] = duplicate([src], 9);
    expect(copy.id).not.toBe(src.id);
    expect([copy.x, copy.y, copy.z]).toEqual([24, 24, 9]);
    copy.points![0] = 99;
    expect(src.points[0]).toBe(0);
  });
});

describe("safeNext", () => {
  it("allows only same-site paths after sign-in", () => {
    expect(safeNext("/b/abc")).toBe("/b/abc");
    expect(safeNext("//evil.com")).toBe("/boards");
    expect(safeNext("/\\evil.com")).toBe("/boards");
    expect(safeNext("https://evil.com")).toBe("/boards");
    expect(safeNext(null)).toBe("/boards");
  });
});

describe("format", () => {
  it("formats relative times and initials", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(timeAgo("2026-10-27T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-27T10:00:00Z", now)).toBe("2 hours ago");
    expect(initials("Guest Otter")).toBe("GO");
  });
});
