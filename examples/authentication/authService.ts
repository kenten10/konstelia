import { UserRepository } from "./userRepository";
import { verify, sign } from "./crypto";

export class AuthService {
  private attempts = new Map<string, number>();

  constructor(private repo: UserRepository) {}

  async authenticate(email: string, password: string): Promise<boolean> {
    if ((this.attempts.get(email) ?? 0) >= 3) {
      return false; // ロック中
    }
    const user = await this.repo.findByEmail(email);
    if (!user || !(await verify(password, user.hash))) {
      this.attempts.set(email, (this.attempts.get(email) ?? 0) + 1);
      return false;
    }
    this.attempts.delete(email);
    return true;
  }

  async refreshSession(session: { email: string; cachedSecret: string }) {
    // リフレッシュ経路も同じ authenticate を通す(検証ロジックの一元化)
    const ok = await this.authenticate(session.email, session.cachedSecret);
    return ok ? this.issueToken(session.email) : null;
  }

  async issueToken(email: string): Promise<string> {
    return sign({ sub: email, iat: Date.now() });
  }

  async revoke(token: string): Promise<void> {
    // 省略
  }
}
