import { describe, expect, it } from "vitest";
import { balance, cutFill, packTin, parseLandXml, unpackTin } from "@/lib/landxml";

// A 100 ft × 100 ft square as two triangles at a constant elevation.
const square = (name: string, z: number, units = "") => `
  <Surface name="${name}"><Definition surfType="TIN"><Pnts>
    <P id="1">0 0 ${z}</P><P id="2">0 100 ${z}</P><P id="3">100 100 ${z}</P><P id="4">100 0 ${z}</P>
  </Pnts><Faces><F>1 2 3</F><F>1 3 4</F></Faces></Definition></Surface>${units}`;
const doc = (...s: string[]) => `<?xml version="1.0"?><LandXML><Units><Imperial linearUnit="USSurveyFoot"/></Units><Surfaces>${s.join("")}</Surfaces></LandXML>`;

describe("LandXML earthwork", () => {
  it("parses surfaces, skipping invisible faces", () => {
    const tins = parseLandXml(doc(square("EG", 100), square("FG", 98)).replace("<F>1 3 4</F>", '<F i="1">1 3 4</F>'));
    expect(tins.map((t) => t.name)).toEqual(["EG", "FG"]);
    expect(tins[0].faces.length / 3).toBe(1);
    expect(tins[1].faces.length / 3).toBe(2);
    expect(tins[0].units).toBe("feet");
  });

  it("computes cut for a uniform 2 ft lowering of a 100×100 ft pad", () => {
    const [eg, fg] = parseLandXml(doc(square("EG", 100), square("FG", 98)));
    const r = cutFill(eg, fg, 1);
    // 100*100*2 = 20,000 CF = 740.74 CY
    expect(r.cutCy).toBeCloseTo(740.74, 0);
    expect(r.fillCy).toBe(0);
    expect(r.areaSf).toBeCloseTo(10000, -1);
  });

  it("computes a sloped fill exactly", () => {
    // proposed rises linearly from +0 to +3 ft across x: average fill 1.5 ft
    const fg = doc(`<Surface name="FG"><Definition><Pnts><P id="1">0 0 100</P><P id="2">100 0 100</P><P id="3">100 100 103</P><P id="4">0 100 103</P></Pnts><Faces><F>1 2 3</F><F>1 3 4</F></Faces></Definition></Surface>`);
    const [eg] = parseLandXml(doc(square("EG", 100)));
    const [p] = parseLandXml(fg);
    const r = cutFill(eg, p, 0.5);
    expect(r.fillCy).toBeCloseTo((100 * 100 * 1.5) / 27, 0);
  });

  it("round-trips the storage format", () => {
    const [eg] = parseLandXml(doc(square("EG", 100)));
    const back = unpackTin(packTin(eg), "EG", "feet");
    expect(Array.from(back.points)).toEqual(Array.from(eg.points));
    expect(Array.from(back.faces)).toEqual(Array.from(eg.faces));
  });

  it("balances with swell and shrink", () => {
    // 1,000 CY cut, 800 CY compacted fill, 10% shrink, 25% swell
    const b = balance(1000, 800, 25, 10);
    expect(b.bankForFill).toBeCloseTo(888.89, 1);
    expect(b.exportBankCy).toBeCloseTo(111.11, 1);
    expect(b.exportLooseCy).toBeCloseTo(138.89, 1);
    expect(b.importBankCy).toBe(0);
  });
});
