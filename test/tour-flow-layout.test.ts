import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import type { TourDocument, TourHop } from "../src/domain/tour/TourDocument";
import { buildTourFlowDiagram } from "../src/domain/tour/TourFlowDiagram";
import {
  flowLayoutMetrics,
  layoutTourFlowDiagram,
} from "../src/presentation/flow/TourFlowLayout";
import { renderTourFlowSvg, truncate, wrapText } from "../src/presentation/flow/TourFlowSvg";

function hop(summary: string): TourHop {
  return { summary, anchors: [{ ref: "anchor.one", emphasis: "primary" }] };
}

function tourWithHops(count: number): TourDocument {
  return {
    id: "wide",
    title: "Wide",
    steps: [{
      id: "step",
      title: "Step",
      hops: Array.from({ length: count }, (_, index) => hop(`hop ${index + 1}`)),
    }],
  };
}

describe("layoutTourFlowDiagram", () => {
  it("places hops left to right and wraps after the column limit", () => {
    const layout = layoutTourFlowDiagram(buildTourFlowDiagram(tourWithHops(4)));
    const [first, second, third, fourth] = layout.nodes;

    assert.equal(first?.y, second?.y);
    assert.equal(second?.y, third?.y);
    assert.ok(first && second && first.x < second.x);
    assert.ok(third && fourth && fourth.y > third.y);
    assert.equal(fourth?.x, first?.x);
  });

  it("stacks one lane per step inside the canvas", () => {
    const layout = layoutTourFlowDiagram(buildTourFlowDiagram({
      id: "two",
      title: "Two",
      steps: [
        { id: "a", title: "A", hops: [hop("one")] },
        { id: "b", title: "B", hops: [hop("two")] },
      ],
    }));
    const [first, second] = layout.groups;

    assert.ok(first && second);
    assert.equal(second.y, first.y + first.height + flowLayoutMetrics.groupGap);
    assert.equal(layout.width, first.width + flowLayoutMetrics.canvasPadding * 2);
    assert.equal(layout.height, second.y + second.height + flowLayoutMetrics.canvasPadding);
    for (const node of layout.nodes) {
      assert.ok(node.x >= first.x && node.x + node.width <= first.x + first.width);
    }
  });

  it("reserves room for a step that has no hops yet", () => {
    const withEmptyStep = layoutTourFlowDiagram(buildTourFlowDiagram({
      id: "empty",
      title: "Empty",
      steps: [{ id: "a", title: "A", hops: [] }, { id: "b", title: "B", hops: [hop("one")] }],
    }));
    const [empty, filled] = withEmptyStep.groups;

    assert.ok(empty && filled);
    assert.equal(
      empty.height,
      flowLayoutMetrics.groupHeaderHeight
      + flowLayoutMetrics.emptyGroupHeight
      + flowLayoutMetrics.groupPaddingBottom,
    );
    assert.ok(filled.y >= empty.y + empty.height);
    assert.deepEqual(withEmptyStep.nodes.map((node) => node.id), ["1:0"]);
  });

  it("routes a straight edge inside a row and an elbow across rows", () => {
    const layout = layoutTourFlowDiagram(buildTourFlowDiagram(tourWithHops(4)));
    const [inRow, , acrossRows] = layout.edges;

    assert.equal(inRow?.points.length, 2);
    assert.equal(inRow?.points[0]?.y, inRow?.points[1]?.y);
    assert.equal(acrossRows?.points.length, 4);
    assert.ok((acrossRows?.points[3]?.y ?? 0) > (acrossRows?.points[0]?.y ?? 0));
  });

  it("connects cross links to the last hop of their step", () => {
    const layout = layoutTourFlowDiagram(buildTourFlowDiagram({
      id: "linked",
      title: "Linked",
      steps: [{
        id: "a",
        title: "A",
        hops: [hop("one"), hop("two")],
        links: [{ to: "other#start", label: "続きを読む" }],
      }],
    }));
    const linkEdge = layout.edges.find((edge) => edge.kind === "link");
    const linkBox = layout.links[0];

    const lastNode = layout.nodes[layout.nodes.length - 1];
    assert.equal(linkEdge?.from, "0:1");
    assert.equal(linkEdge?.to, "link:0:0");
    assert.ok(linkBox && lastNode && layout.groups[0]);
    assert.ok(linkBox.y >= lastNode.y + lastNode.height, "link chips must not overlap the hops");
    assert.ok(linkBox.y + linkBox.height <= layout.groups[0].y + layout.groups[0].height);
  });

  it("gives an empty tour a canvas without lanes", () => {
    const layout = layoutTourFlowDiagram(buildTourFlowDiagram({ id: "x", title: "X", steps: [] }));

    assert.deepEqual(layout.groups, []);
    assert.equal(layout.height, flowLayoutMetrics.canvasPadding * 2);
  });
});

describe("renderTourFlowSvg", () => {
  const diagram = buildTourFlowDiagram(
    {
      id: "svg",
      title: "SVG",
      steps: [{
        id: "a",
        title: "A",
        hops: [
          { summary: "<script>alert(1)</script>", anchors: [{ ref: "a.b", emphasis: "primary" }] },
          {
            summary: "二つ目",
            anchors: [
              { ref: "a.c", emphasis: "primary" },
              { ref: "a.d", emphasis: "secondary" },
            ],
          },
        ],
      }],
    },
    { anchorHealth: new Map([["a.c", AnchorHealth.Drifted]]) },
  );

  it("exposes node ids so the webview can request a jump", () => {
    const svg = renderTourFlowSvg(layoutTourFlowDiagram(diagram));

    assert.match(svg, /data-node-id="0:0"/);
    assert.match(svg, /data-node-id="0:1"/);
    assert.match(svg, /class="flow-node drifted"/);
  });

  it("marks only the current hop", () => {
    const svg = renderTourFlowSvg(layoutTourFlowDiagram(diagram), { currentNodeId: "0:1" });

    assert.equal(svg.match(/flow-node[^"]*current/g)?.length, 1);
    assert.match(svg, /class="flow-node drifted current"/);
  });

  it("escapes every string the tour contributes", () => {
    const hostile = "<script>alert(1)</script>";
    const svg = renderTourFlowSvg(layoutTourFlowDiagram(buildTourFlowDiagram({
      id: "x",
      title: "X",
      steps: [{
        id: "a",
        title: hostile,
        hops: [{ summary: hostile, anchors: [{ ref: hostile, emphasis: "primary" }] }],
        links: [{ to: `${hostile}#s`, label: hostile }],
      }],
    })));

    assert.ok(!svg.includes("<script>"), "no raw markup from the tour reaches the page");
    assert.ok(!svg.includes(hostile));
    // Attributes carry tour text too, so they must be escaped, not only text nodes.
    assert.match(svg, /data-link-target="&lt;script&gt;alert\(1\)&lt;\/script&gt;#s"/);
    assert.match(svg, /aria-label="[^"]*&lt;script&gt;/);
  });

  it("names the missing pieces of a half-written tour", () => {
    const svg = renderTourFlowSvg(layoutTourFlowDiagram(buildTourFlowDiagram({
      id: "draft",
      title: "Draft",
      steps: [
        { id: "empty", title: "Empty", hops: [] },
        { id: "started", title: "Started", hops: [{ summary: "新しいホップ", anchors: [] }] },
      ],
    })));

    assert.match(svg, /ホップがありません/);
    assert.match(svg, /アンカー未設定/);
  });

  it("shows the primary anchor and how many others the hop highlights", () => {
    const svg = renderTourFlowSvg(layoutTourFlowDiagram(diagram));

    assert.match(svg, />a\.c \+1</);
  });
});

describe("flow diagram text helpers", () => {
  it("counts full-width characters as two columns", () => {
    assert.equal(truncate("日本語のとても長い説明文です", 10), "日本語の…");
    assert.equal(truncate("short", 10), "short");
  });

  it("wraps into at most the requested number of lines", () => {
    const lines = wrapText("あいうえおかきくけこさしすせそ", 10, 2);

    assert.equal(lines.length, 2);
    assert.equal(lines[0], "あいうえお");
    assert.match(lines[1] ?? "", /…$/);
  });
});
