import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index.js";

const TOKEN = "read-only-test-token";
const ADDON_ID = "{e9df396f-bdd8-4e79-bc7c-92017a928891}";
const API_BASE = "https://api.github.com/repos/jcvb2003/SIGESS-Extensao";
const RELEASES_URL = `${API_BASE}/releases/latest`;
const UPDATES_URL = `${API_BASE}/contents/updates.json?ref=main`;
const ASSET_URL = `${API_BASE}/releases/assets/42`;
const DIGEST = `sha256:${"a".repeat(64)}`;
const ENV = { GITHUB_READ_TOKEN: TOKEN };

function makeAsset(overrides = {}) {
  return {
    id: 42,
    name: "sigess.xpi",
    state: "uploaded",
    size: 10,
    digest: DIGEST,
    updated_at: "2026-09-14T12:00:00Z",
    ...overrides,
  };
}

function releaseResponse(asset = makeAsset()) {
  return new Response(JSON.stringify({ assets: [asset] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function updatesResponse(
  updates = [
    {
      version: "3.1.30",
      update_link:
        "https://github.com/jcvb2003/SIGESS-Extensao/releases/download/v3.1.30/sigess.xpi",
    },
    {
      version: "3.1.29",
      update_link:
        "https://github.com/jcvb2003/SIGESS-Extensao/releases/download/v3.1.29/sigess.xpi",
    },
  ],
) {
  return new Response(JSON.stringify({ addons: { [ADDON_ID]: { updates } } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(...responses) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callHeaders(call) {
  return new Headers(call[1]?.headers);
}

describe("SIGESS XPI download worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams the private release asset with Firefox installation headers", async () => {
    const fetchMock = stubFetch(
      releaseResponse(),
      new Response("signed-xpi", {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": "10",
        },
      }),
    );

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi"),
      ENV,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/x-xpinstall",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="sigess.xpi"',
    );
    expect(response.headers.get("etag")).toBe(`"sha256-${"a".repeat(64)}"`);
    expect(await response.text()).toBe("signed-xpi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(RELEASES_URL);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
    expect(callHeaders(fetchMock.mock.calls[0]).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(ASSET_URL);
    expect(fetchMock.mock.calls[1][1].redirect).toBe("manual");
    expect(callHeaders(fetchMock.mock.calls[1]).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(callHeaders(fetchMock.mock.calls[1]).get("accept")).toBe(
      "application/octet-stream",
    );
  });

  it("follows GitHub's signed asset URL without forwarding the repository token", async () => {
    const signedUrl =
      "https://release-assets.githubusercontent.com/sigess.xpi?signature=temporary";
    const fetchMock = stubFetch(
      releaseResponse(),
      new Response(null, {
        status: 302,
        headers: { Location: signedUrl },
      }),
      new Response("partial-xpi", {
        status: 206,
        headers: {
          "Content-Length": "1",
          "Content-Range": "bytes 0-0/10",
        },
      }),
    );

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi", {
        headers: { Range: "bytes=0-0" },
      }),
      ENV,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-0/10");
    expect(await response.text()).toBe("partial-xpi");
    expect(fetchMock.mock.calls[1][0]).toBe(ASSET_URL);
    expect(callHeaders(fetchMock.mock.calls[1]).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(fetchMock.mock.calls[2][0].toString()).toBe(signedUrl);
    expect(callHeaders(fetchMock.mock.calls[2]).has("authorization")).toBe(
      false,
    );
    expect(callHeaders(fetchMock.mock.calls[2]).get("range")).toBe("bytes=0-0");
  });

  it("rejects an asset redirect outside GitHub's asset domain", async () => {
    const fetchMock = stubFetch(
      releaseResponse(),
      new Response(null, {
        status: 302,
        headers: { Location: "https://example.invalid/sigess.xpi" },
      }),
    );

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi"),
      ENV,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "download_temporarily_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetches the exact release named by a Cloudflare update link", async () => {
    const versionReleaseUrl = `${API_BASE}/releases/tags/v3.1.30`;
    const fetchMock = stubFetch(
      releaseResponse(),
      new Response("signed-xpi", {
        status: 200,
        headers: { "Content-Length": "10" },
      }),
    );

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi?version=3.1.30"),
      ENV,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("signed-xpi");
    expect(fetchMock.mock.calls[0][0]).toBe(versionReleaseUrl);
    expect(fetchMock.mock.calls[1][0]).toBe(ASSET_URL);
  });

  it("rejects malformed release versions before contacting GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(
        "https://downloads.sigess.com.br/sigess.xpi?version=latest%2Fprivate",
      ),
      ENV,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_version" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves 416 responses for ranges outside the XPI size", async () => {
    const fetchMock = stubFetch(
      releaseResponse(),
      new Response(null, {
        status: 302,
        headers: {
          Location:
            "https://release-assets.githubusercontent.com/sigess.xpi?signature=temporary",
        },
      }),
      new Response(null, {
        status: 416,
        headers: {
          "Content-Range": "bytes */10",
        },
      }),
    );

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi", {
        headers: { Range: "bytes=99-100" },
      }),
      ENV,
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    expect(await response.text()).toBe("");
  });

  it("serves the update manifest through Cloudflare while preserving GitHub links in the source", async () => {
    const fetchMock = stubFetch(updatesResponse());

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/updates.json"),
      ENV,
    );
    const manifest = await response.json();
    const updates = manifest.addons[ADDON_ID].updates;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(updates[0].update_link).toBe(
      "https://downloads.sigess.com.br/sigess.xpi?version=3.1.30",
    );
    expect(updates[1].update_link).toBe(
      "https://github.com/jcvb2003/SIGESS-Extensao/releases/download/v3.1.29/sigess.xpi",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(UPDATES_URL);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
    expect(callHeaders(fetchMock.mock.calls[0]).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(callHeaders(fetchMock.mock.calls[0]).get("accept")).toBe(
      "application/vnd.github.raw+json",
    );
  });

  it("supports HEAD for the XPI without downloading the release asset", async () => {
    const fetchMock = stubFetch(releaseResponse());

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi", {
        method: "HEAD",
      }),
      ENV,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-type")).toBe(
      "application/x-xpinstall",
    );
    expect(await response.text()).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 304 for a matching XPI ETag without fetching the asset", async () => {
    const fetchMock = stubFetch(releaseResponse());

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi", {
        headers: { "If-None-Match": `"sha256-${"a".repeat(64)}"` },
      }),
      ENV,
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("content-length")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports HEAD on the update manifest without returning a body", async () => {
    const fetchMock = stubFetch(updatesResponse());

    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/updates.json", {
        method: "HEAD",
      }),
      ENV,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.text()).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the read-only GitHub secret is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const xpiResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi"),
      {},
    );
    const updatesResponseWithoutToken = await worker.fetch(
      new Request("https://downloads.sigess.com.br/updates.json"),
      {},
    );

    expect(xpiResponse.status).toBe(503);
    expect(updatesResponseWithoutToken.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the existing install-page and root redirects", async () => {
    const rootResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/"),
    );
    const installResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/instalar"),
    );
    const html = await installResponse.text();

    expect(rootResponse.status).toBe(307);
    expect(rootResponse.headers.get("location")).toBe(
      "https://downloads.sigess.com.br/instalar",
    );
    expect(installResponse.status).toBe(200);
    expect(html).toContain(
      'content="3;url=https://downloads.sigess.com.br/sigess.xpi"',
    );
    expect(html).toContain('href="https://downloads.sigess.com.br/sigess.xpi"');
    expect(html).not.toContain("github.com");
  });

  it("supports HEAD on the existing installation page", async () => {
    const response = await worker.fetch(
      new Request("https://downloads.sigess.com.br/instalar", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("keeps health, method validation, and unknown paths working", async () => {
    const healthResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/health", {
        method: "HEAD",
      }),
    );
    const methodResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/updates.json", {
        method: "POST",
      }),
      ENV,
    );
    const xpiMethodResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/sigess.xpi", {
        method: "POST",
      }),
      ENV,
    );
    const pathResponse = await worker.fetch(
      new Request("https://downloads.sigess.com.br/other"),
    );

    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.text()).toBe("");
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("GET, HEAD");
    expect(xpiMethodResponse.status).toBe(405);
    expect(xpiMethodResponse.headers.get("allow")).toBe("GET, HEAD");
    expect(pathResponse.status).toBe(404);
  });
});
