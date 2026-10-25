import pg from "pg";
import { describe, expect, it } from "vitest";
import "../../src/config/database.js";

describe("PostgreSQL API value types", () => {
  it("returns safe 64-bit integers and rejects values that JavaScript cannot represent exactly", () => {
    const parseInt8 = pg.types.getTypeParser(20);

    expect(parseInt8("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => parseInt8("9007199254740992")).toThrow(RangeError);
    expect(() => parseInt8("-9007199254740992")).toThrow(RangeError);
  });

  it("returns numeric and date values in API-compatible JavaScript types", () => {
    expect(pg.types.getTypeParser(1700)("12.345")).toBe(12.345);
    expect(pg.types.getTypeParser(1082)("2026-12-01")).toBe("2026-12-01");
    expect(pg.types.getTypeParser(1114)("2026-12-01 12:30:00")).toBe("2026-12-01 12:30:00");
    expect(pg.types.getTypeParser(1184)("2026-12-01 12:30:00+00")).toBe("2026-12-01T12:30:00.000Z");
  });
});
