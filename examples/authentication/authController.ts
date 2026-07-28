import { Request, Response } from "express";
import { AuthService } from "./authService";

export class AuthController {
  constructor(private service: AuthService) {}

  async login(req: Request, res: Response) {
    const { email, password } = req.body; // DTO 変換のみ。検証はしない
    const ok = await this.service.authenticate(email, password);
    if (!ok) {
      res.status(401).json({ error: "invalid credentials" });
      return;
    }
    res.json({ token: await this.service.issueToken(email) });
  }

  async logout(req: Request, res: Response) {
    await this.service.revoke(req.body.token);
    res.status(204).end();
  }
}
