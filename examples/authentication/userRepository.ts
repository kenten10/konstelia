import { db } from "./db";

export interface User {
  id: string;
  email: string;
  hash: string;
}

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    // email カラムには UNIQUE 制約がある前提(migration 0003 参照)
    return db.queryOne<User>("SELECT * FROM users WHERE email = $1", [email]);
  }
}
