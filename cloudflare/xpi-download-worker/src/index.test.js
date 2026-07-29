import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index.js";

describe("SIGESS XPI download worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams the signed XPI with Firefox installation headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("signed-xpi", {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          ETag: '"release-etag"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/x-xpinstall",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="sigess.xpi"',
    );
    expect(await response.text()).toBe("signed-xpi");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/jcvb2003/SIGESS-Extensao/releases/latest/download/sigess.xpi",
      expect.objectContaining({ redirect: "follow" }),
    );
  });

  it("does not expose the upstream URL in a redirect", async () => {
    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://downloads.sigess.com.br/sigess.xpi",
    );
  });

  it("rejects unsupported methods and paths", async () => {
    const methodResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi", {
        method: "POST",
      }),
    );
    const pathResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/other"),
    );

    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("GET, HEAD");
    expect(pathResponse.status).toBe(404);
  });
});
