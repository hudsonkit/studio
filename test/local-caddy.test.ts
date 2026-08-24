import { describe, expect, test } from "bun:test";

import {
  registryToCaddyfileConfig,
  renderStudioLocalCaddyfile,
  type StudioMachineRegistry,
} from "../src/local";

describe("studio local Caddyfile", () => {
  test("renders portal, enabled studio proxy, and same-origin start routes", () => {
    const registry: StudioMachineRegistry = {
      version: 1,
      studios: [
        {
          id: "studio",
          repo: "/Users/arach/dev/studio",
          enabled: true,
          host: "studio.studio.local",
          port: 5191,
        },
        {
          id: "disabled",
          repo: "/Users/arach/dev/disabled",
          enabled: false,
          host: "disabled.studio.local",
          port: 5200,
        },
      ],
    };

    const caddyfile = renderStudioLocalCaddyfile(
      {
        ...registryToCaddyfileConfig(registry, 43180),
        previews: [
          {
            id: "studio",
            host: "action.studio.local",
            port: 5191,
            enabled: true,
          },
        ],
      },
    );

    expect(caddyfile).toContain("http://studio.local {");
    expect(caddyfile).toContain("reverse_proxy 127.0.0.1:43180");
    expect(caddyfile).toContain("http://studio.studio.local {");
    expect(caddyfile).toContain("handle /__studio/start");
    expect(caddyfile).toContain("rewrite * /api/studios/studio/start");
    expect(caddyfile).toContain("reverse_proxy 127.0.0.1:5191");
    expect(caddyfile).toContain("rewrite * /__studio/fallback/studio");
    expect(caddyfile).toContain("http://action.studio.local {");
    expect(caddyfile.match(/reverse_proxy 127\.0\.0\.1:5191/g)).toHaveLength(2);
    expect(caddyfile).not.toContain("disabled.studio.local");
  });

  test("can render local HTTPS with Caddy internal TLS", () => {
    const caddyfile = renderStudioLocalCaddyfile({
      supervisorPort: 43180,
      scheme: "https",
      studios: [],
    });

    expect(caddyfile).toContain("studio.local {\n\ttls internal");
    expect(caddyfile).not.toContain("http://studio.local");
  });
});
