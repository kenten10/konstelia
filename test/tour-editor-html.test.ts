import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TourScope } from "../src/domain/tour/TourScope";
import { renderTourEditorHtml, type RenderedDraft } from "../src/presentation/editor/TourEditorHtml";

const draft: RenderedDraft = {
  scope: TourScope.Repository,
  tour: {
    id: "auth-api",
    title: "Auth API",
    steps: [{
      id: "login",
      title: "Login",
      hops: [{ summary: "entry", anchors: [{ ref: "auth.login", emphasis: "primary" }] }],
    }],
  },
  anchors: [{ id: "auth.login", file: "src/auth.ts", symbol: "login" }],
  stepTargets: [],
  tourIds: [],
};

describe("renderTourEditorHtml", () => {
  it("locks the page down to its own inline style and script", () => {
    const html = renderTourEditorHtml(draft);
    const nonce = /script-src 'nonce-([^']+)'/.exec(html)?.[1];

    assert.ok(nonce && nonce.length >= 16, "a nonce must be present and hard to guess");
    assert.match(html, /default-src 'none'/);
    assert.ok(!html.includes("unsafe-inline"), "inline style and script run under the nonce");
    assert.equal(html.match(new RegExp(`nonce="${nonce.replace(/[+/=]/g, "\\$&")}"`, "g"))?.length, 3);
  });

  it("uses a fresh nonce for every page", () => {
    const first = /nonce-([^']+)'/.exec(renderTourEditorHtml(draft))?.[1];
    const second = /nonce-([^']+)'/.exec(renderTourEditorHtml(draft))?.[1];

    assert.notEqual(first, second);
  });

  it("cannot be escaped by a tour that contains markup", () => {
    const html = renderTourEditorHtml({
      ...draft,
      tour: { ...draft.tour, title: "</script><img src=x onerror=alert(1)>" },
    });

    assert.ok(!html.includes("</script><img"), "the data block must not be closable from a title");
    assert.match(html, /\\u003c\/script>/);
  });

  it("carries the draft the page needs to render itself", () => {
    const html = renderTourEditorHtml({ ...draft, restored: true });
    const data = /<script type="application\/json" id="draft-data"[^>]*>(.*?)<\/script>/s.exec(html)?.[1];
    const parsed = JSON.parse((data ?? "").replace(/\\u003c/g, "<")) as RenderedDraft;

    assert.equal(parsed.tour.id, "auth-api");
    assert.equal(parsed.restored, true);
    assert.deepEqual(parsed.anchors, draft.anchors);
  });
});
