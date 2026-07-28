// TourPlayer — 唯一の状態機械。vscode API に依存しない(仕様 §6.1 / §8 の制約)。
// ビュー(EditorRenderer, 将来の FlowDiagramView)は subscribe() で投影に徹する。

class TourPlayer {
  constructor(tour) {
    this.tour = tour;
    this.stepIndex = 0;
    this.hopIndex = 0;
    this.active = false;
    this._listeners = [];
  }

  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter((f) => f !== fn); };
  }

  _emit(kind) {
    const s = this.state();
    for (const fn of this._listeners) fn(kind, s);
  }

  state() {
    const step = this.tour.steps[this.stepIndex];
    return {
      active: this.active,
      tour: this.tour,
      stepIndex: this.stepIndex,
      hopIndex: this.hopIndex,
      step,
      hop: step ? step.hops[this.hopIndex] : undefined,
      // 先読み用: 次ホップ(ステップ跨ぎ含む)を覗く
      nextHop: this._peek(+1),
    };
  }

  start() { this.active = true; this.stepIndex = 0; this.hopIndex = 0; this._emit("start"); }
  exit()  { this.active = false; this._emit("exit"); }

  // §6.2 の意味論: ホップ内→次ホップ、最終ホップ→次ステップ第1ホップ、最終→完了
  next() {
    const p = this._peekIndices(+1);
    if (!p) { this._emit("completed"); return; }
    [this.stepIndex, this.hopIndex] = p;
    this._emit("move");
  }

  prev() {
    const p = this._peekIndices(-1);
    if (!p) return; // 先頭で prev は no-op
    [this.stepIndex, this.hopIndex] = p;
    this._emit("move");
  }

  gotoStep(i) {
    if (i < 0 || i >= this.tour.steps.length) return;
    this.stepIndex = i; this.hopIndex = 0; this._emit("move");
  }

  _peekIndices(dir) {
    let s = this.stepIndex, h = this.hopIndex + dir;
    while (true) {
      const step = this.tour.steps[s];
      if (!step) return null;
      if (h >= 0 && h < step.hops.length) return [s, h];
      if (dir > 0) { s++; h = 0; }
      else { s--; const ps = this.tour.steps[s]; if (!ps) return null; h = ps.hops.length - 1; }
      if (s < 0 || s >= this.tour.steps.length) return null;
    }
  }

  _peek(dir) {
    const p = this._peekIndices(dir);
    return p ? this.tour.steps[p[0]].hops[p[1]] : undefined;
  }
}

module.exports = { TourPlayer };
