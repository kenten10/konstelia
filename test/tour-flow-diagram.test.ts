import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import {
  buildTourFlowDiagram,
  parseTourFlowNodeId,
  tourFlowNodeId,
} from "../src/domain/tour/TourFlowDiagram";

const tour: TourDocument = {
  id: "auth-api",
  title: "認証APIの流れ",
  steps: [
    {
      id: "login-flow",
      title: "ログインリクエストの流れ",
      hops: [
        {
          summary: "エントリポイント",
          body: "Controller は DTO 変換だけを行います。",
          anchors: [{ ref: "auth.controller.login", emphasis: "primary" }],
        },
        {
          summary: "authenticate は 2 箇所から呼ばれる",
          anchors: [
            { ref: "auth.service.authenticate", emphasis: "primary" },
            { ref: "auth.refresher.refresh-call", emphasis: "secondary" },
          ],
        },
      ],
      links: [{ to: "auth-internals#token-verification", label: "トークン検証を深掘りする" }],
    },
    {
      id: "token-issue",
      title: "トークン発行",
      hops: [
        {
          summary: "トークンを発行する",
          anchors: [{ ref: "auth.token.issue", emphasis: "primary" }],
        },
      ],
    },
  ],
};

describe("buildTourFlowDiagram", () => {
  it("turns hops into ordered nodes grouped by step", () => {
    const diagram = buildTourFlowDiagram(tour);

    assert.deepEqual(
      diagram.nodes.map((node) => [node.id, node.ordinal, node.summary]),
      [
        ["0:0", 0, "エントリポイント"],
        ["0:1", 1, "authenticate は 2 箇所から呼ばれる"],
        ["1:0", 2, "トークンを発行する"],
      ],
    );
    assert.deepEqual(
      diagram.groups.map((group) => [group.stepId, group.nodeIds]),
      [["login-flow", ["0:0", "0:1"]], ["token-issue", ["1:0"]]],
    );
    assert.equal(diagram.nodes[0]?.hasBody, true);
    assert.equal(diagram.nodes[1]?.hasBody, false);
  });

  it("distinguishes hop transitions from step transitions", () => {
    const diagram = buildTourFlowDiagram(tour);

    assert.deepEqual(diagram.edges, [
      { from: "0:0", to: "0:1", kind: "hop" },
      { from: "0:1", to: "1:0", kind: "step" },
    ]);
  });

  it("keeps cross links attached to their step", () => {
    const diagram = buildTourFlowDiagram(tour);

    assert.deepEqual(diagram.links, [
      {
        id: "link:0:0",
        stepIndex: 0,
        label: "トークン検証を深掘りする",
        target: "auth-internals#token-verification",
      },
    ]);
    assert.deepEqual(diagram.groups[0]?.linkIds, ["link:0:0"]);
    assert.deepEqual(diagram.groups[1]?.linkIds, []);
  });

  it("reports the worst health of the anchors a hop shows", () => {
    const diagram = buildTourFlowDiagram(tour, {
      anchorHealth: new Map([
        ["auth.controller.login", AnchorHealth.Drifted],
        ["auth.refresher.refresh-call", AnchorHealth.Broken],
      ]),
    });

    assert.deepEqual(
      diagram.nodes.map((node) => node.health),
      [AnchorHealth.Drifted, AnchorHealth.Broken, AnchorHealth.Healthy],
    );
  });

  it("treats an unknown health map as healthy", () => {
    assert.equal(buildTourFlowDiagram(tour).nodes[1]?.health, AnchorHealth.Healthy);
  });

  it("round-trips node ids and rejects anything else", () => {
    assert.deepEqual(parseTourFlowNodeId(tourFlowNodeId(0, 0)), { stepIndex: 0, hopIndex: 0 });
    assert.deepEqual(parseTourFlowNodeId(tourFlowNodeId(3, 12)), { stepIndex: 3, hopIndex: 12 });
    for (const value of ["", "1", "1:", ":1", "a:b", "-1:0", "1:2:3", "link:0:0", "1.0:2"]) {
      assert.equal(parseTourFlowNodeId(value), undefined, value);
    }
  });

  it("keeps empty steps as groups without nodes", () => {
    const diagram = buildTourFlowDiagram({
      id: "draft",
      title: "Draft",
      steps: [{ id: "empty", title: "Empty", hops: [] }],
    });

    assert.deepEqual(diagram.nodes, []);
    assert.deepEqual(diagram.edges, []);
    assert.deepEqual(diagram.groups[0]?.nodeIds, []);
  });
});
