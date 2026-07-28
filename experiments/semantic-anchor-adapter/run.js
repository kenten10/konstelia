```javascript
const ts = require("typescript");
const { generateAnchor, resolvePath } = require("./adapter");

const SAMPLE = `
import { Router } from "express";

export class AuthService {
  private attempts = 0;

  async authenticate(email: string, password: string): Promise<boolean> {
    const user = await this.repo.findByEmail(email);
    if (!user) {
      this.attempts++;
      return false;
    }
    if (user.locked) {
      return false;
    }
    return verify(password, user.hash);
  }

  get lockedOut(): boolean { return this.attempts > 3; }
  set lockedOut(v: boolean) { this.attempts = v ? 99 : 0; }
}

// overloads: 同名3連
export function parse(x: string): number;
export function parse(x: number): string;
export function parse(x: any): any {
  if (typeof x === "string") return Number(x);
  return String(x);
}

// arrow function const
export const login = async (req: Request, res: Response) => {
  const token = await issueToken(req.body);
  res.json({ token });
};

// 無名コールバック地獄
export function setupRoutes(router: Router) {
  router.get("/login", async (req, res) => {
    const ok = await check(req);
    if (!ok) {
      res.status(401).end();
      return;
    }
    res.json({ ok });
  });
  router.post("/logout", (req, res) => {
    res.end();
  });
}

// export default 無名クラス
export default class {
  run() { console.log("anonymous default"); }
}

// ネストした名前付き関数
export function outer() {
  function inner() {
    return 42;
  }
  return inner();
}

// 分割代入(名前が単一でない)
export const { a, b } = loadConfig();

// object literal のハンドラ群
export const handlers = {
  onLogin(user: User) {
    audit("login", user);
  },
  onLogout: (user: User) => {
    audit("logout", user);
  },
};

// computed property name
export const dispatch = {
  [Symbol.iterator]() { return null as any; },
};

// namespace
export namespace Billing {
  export class Invoice {
    total(): number { return 0; }
  }
}
`;

const sf = ts.createSourceFile("sample.ts", SAMPLE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

// selection is specified by a unique substring (optionally with occurrence index)
function sel(substr, occ = 0) {
  let idx = -1;
  for (let i = 0; i <= occ; i++) idx = SAMPLE.indexOf(substr, idx + 1);
  if (idx < 0) throw new Error("substring not found: " + substr);
  return [idx, idx + substr.length];
}

const CASES = [
  ["メソッド全体を選択", sel(`async authenticate(email: string, password: string): Promise<boolean> {
    const user = await this.repo.findByEmail(email);
    if (!user) {
      this.attempts++;
      return false;
    }
    if (user.locked) {
      return false;
    }
    return verify(password, user.hash);
  }`)],
  ["メソッド内の2番目のif文", sel(`if (user.locked) {
      return false;
    }`)],
  ["メソッド内の特定のreturn", sel(`return verify(password, user.hash);`)],
  ["メソッド内の呼び出し式", sel(`this.repo.findByEmail(email)`)],
  ["getter", sel(`get lockedOut(): boolean { return this.attempts > 3; }`)],
  ["setter内の代入(構造refinementなし)", sel(`this.attempts = v ? 99 : 0;`)],
  ["オーバーロード宣言1つ目", sel(`export function parse(x: string): number;`)],
  ["オーバーロード実装本体のif", sel(`if (typeof x === "string") return Number(x);`)],
  ["arrow const の中の呼び出し", sel(`issueToken(req.body)`)],
  ["無名コールバック内のif文", sel(`if (!ok) {
      res.status(401).end();
      return;
    }`)],
  ["無名コールバック自体", sel(`async (req, res) => {
    const ok = await check(req);
    if (!ok) {
      res.status(401).end();
      return;
    }
    res.json({ ok });
  }`)],
  ["2つ目のルート登録(post)", sel(`router.post("/logout", (req, res) => {
    res.end();
  });`)],
  ["export default 無名クラスのメソッド", sel(`run() { console.log("anonymous default"); }`)],
  ["ネスト関数inner", sel(`function inner() {
    return 42;
  }`)],
  ["分割代入の一部", sel(`{ a, b }`)],
  ["object literal メソッド", sel(`onLogin(user: User) {
    audit("login", user);
  }`)],
  ["object literal アロープロパティ内", sel(`audit("logout", user)`)],
  ["computed property のメソッド本体", sel(`return null as any;`)],
  ["namespace 内のメソッド", sel(`total(): number { return 0; }`)],
];

let genOk = 0, rejected = 0, roundtripFail = 0, snappedCount = 0;
for (const [label, [start, end]] of CASES) {
  const g = generateAnchor(sf, start, end);
  if (!g.ok) {
    rejected++;
    console.log(`✗ REJECT  ${label}\n          → ${g.reason}\n`);
    continue;
  }
  genOk++;
  if (g.snapped) snappedCount++;
  const r = resolvePath(sf, g.path);
  const rt = r.ok ? "roundtrip:OK" : `roundtrip:FAIL(${r.reason})`;
  if (!r.ok) roundtripFail++;
  console.log(`${g.snapped ? "≈ SNAP  " : "✓ EXACT "}  ${label}\n          → ${g.path}  [${rt}]${g.snapNote ? "\n          note: " + g.snapNote : ""}\n`);
}
console.log(`---\ngenerated: ${genOk}/${CASES.length}  (exact: ${genOk - snappedCount}, snapped: ${snappedCount})  rejected: ${rejected}  roundtrip failures: ${roundtripFail}`);
```
