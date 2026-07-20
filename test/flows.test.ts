import { describe, expect, test } from "bun:test";

import {
  FLOW_VERSION,
  emptyFile,
  getPack,
  parseFlowFile,
} from "../src/flows/model";
import { embedSlugFromSrc } from "../src/flows/ui/embedSurfaces";

describe("Studio Flows", () => {
  test("creates and parses the current file format", () => {
    const file = emptyFile("Checkout journey", "file_checkout");

    expect(file.version).toBe(FLOW_VERSION);
    expect(parseFlowFile(structuredClone(file))).toEqual(file);
  });

  test("rejects pre-cutover file versions", () => {
    expect(() =>
      parseFlowFile({
        ...emptyFile("Old journey"),
        version: 1,
      }),
    ).toThrow("Unsupported flow version: 1");
  });

  test("ships a product-neutral starter pack", () => {
    const pack = getPack("product-core");

    expect(pack?.journeys.map((journey) => journey.name)).toEqual([
      "Acquisition",
      "Core loop",
      "Return",
    ]);
  });

  test("resolves nested and absolute Studio embed routes", () => {
    expect(embedSlugFromSrc("/embed/fieldwork/candidate-orientation")).toBe(
      "candidate-orientation",
    );
    expect(
      embedSlugFromSrc("http://127.0.0.1:3033/embed/producer-compile"),
    ).toBe("producer-compile");
  });
});
