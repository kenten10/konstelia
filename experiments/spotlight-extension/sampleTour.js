// スパイク用サンプルツアー。本実装では .codetours/tours/*.tour.yaml + anchors.yaml から読む。
// アンカーは簡易リゾルバ用(search 文字列)。emphasis 規則は仕様 §5.1 どおり primary ちょうど1つ。
module.exports = {
  id: "auth-api",
  title: "認証APIの流れ",
  steps: [
    {
      id: "login-flow",
      title: "ログインリクエストの流れ",
      hops: [
        {
          summary: "エントリポイント: Controller は DTO 変換だけ",
          body: "Controller は検証ロジックを持たず、Service に委譲します。",
          anchors: [
            { file: "examples/authentication/authController.ts", search: "async login(req: Request, res: Response)", emphasis: "primary" },
          ],
        },
        {
          summary: "authenticate が検証の本体。2箇所から呼ばれる",
          body: "Controller と TokenRefresher の両方が同じ authenticate を通ります。",
          anchors: [
            { file: "examples/authentication/authService.ts", search: "async authenticate(email: string, password: string)", emphasis: "primary" },
            { file: "examples/authentication/authController.ts", search: "this.service.authenticate(email, password)", emphasis: "secondary" },
            { file: "examples/authentication/authService.ts", search: "this.authenticate(session.email, session.cachedSecret)", emphasis: "secondary" },
          ],
        },
        {
          summary: "永続層はメールアドレスの一意性を前提にする",
          anchors: [
            { file: "examples/authentication/userRepository.ts", search: "findByEmail(email: string)", emphasis: "primary" },
          ],
        },
      ],
    },
    {
      id: "lockout",
      title: "アカウントロックの仕組み",
      hops: [
        {
          summary: "失敗回数はサービス内でカウント",
          anchors: [
            { file: "examples/authentication/authService.ts", search: "private attempts = new Map<string, number>();", emphasis: "primary" },
          ],
        },
        {
          summary: "3回失敗でロック。閾値はここ",
          anchors: [
            { file: "examples/authentication/authService.ts", search: "if ((this.attempts.get(email) ?? 0) >= 3)", emphasis: "primary" },
          ],
        },
      ],
    },
  ],
};
