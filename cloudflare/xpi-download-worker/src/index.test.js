import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index.js";

describe("SIGESS XPI download worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams the latest signed XPI with Firefox installation headers", async () => {
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

  it("proxies strict versioned XPI paths with immutable caching", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("versioned-xpi", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(
        "https://downloads.sigess.com.br/releases/v3.1.22/sigess.xpi",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/jcvb2003/SIGESS-Extensao/releases/download/v3.1.22/sigess.xpi",
      expect.any(Object),
    );

    const invalidResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/releases/v3.1/sigess.xpi"),
    );
    expect(invalidResponse.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("proxies the Firefox update manifest through the SIGESS domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"addons":{}}', {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/updates.json"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.has("content-disposition")).toBe(false);
    expect(await response.json()).toEqual({ addons: {} });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/jcvb2003/SIGESS-Extensao/main/updates.json",
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
