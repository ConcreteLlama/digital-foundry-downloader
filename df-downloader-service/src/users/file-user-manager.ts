import z from "zod";
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { UserService } from "./user-service.js";
import { UserEntity } from "df-downloader-common";
import { fromZodError } from "zod-validation-error";

const UsersSchema = z.object({
  users: UserEntity.array()
    .default([])
    .transform((value) => new Map<string, UserEntity>(value.map((user) => [user.id, user]))),
});

const UsersFileSchema = UsersSchema.extend({
  users: z.map(z.string(), UserEntity).transform((value) => [...value.values()]),
});

type UserData = z.infer<typeof UsersSchema>;
export class FileUserService implements UserService {
  private userData: UserData;
  private usersFilePath: fs.PathLike;

  static create(dir: string) {
    const usersFilePath = path.join(dir, "users.yaml");
    let usersStr: string | undefined;
    let usersPlain = {};
    try {
      usersStr = fs.readFileSync(usersFilePath, "utf-8");
      usersPlain = YAML.parse(usersStr);
    } catch (e) {}
    if (!usersStr?.length || !usersPlain) {
      usersPlain = {
        users: [],
      };
      fs.writeFileSync(usersFilePath, YAML.stringify(usersPlain));
    }
    const result = UsersSchema.safeParse(usersPlain);
    if (!result.success) {
      throw new Error(fromZodError(result.error).toString());
    }
    const users = result.data;
    return new FileUserService(users, usersFilePath);
  }

  private constructor(cachedUserData: UserData, usersFilePath: fs.PathLike) {
    this.userData = cachedUserData;
    this.usersFilePath = usersFilePath;
  }

  getUser(id: string) {
    return this.userData.users.get(id);
  }
  hasUsers(): boolean | Promise<boolean> {
    return this.userData.users.size > 0;
  }
  async createUser(user: UserEntity) {
    if (this.userData.users.has(user.id)) {
      throw new Error(`User ${user.id} already exists`);
    }
    this.userData.users.set(user.id, user);
    await this.updateUsers();
  }
  async updateUser(userId: string, user: Partial<UserEntity>): Promise<UserEntity> {
    const existingUser = this.userData.users.get(userId);
    if (!existingUser) {
      throw new Error(`User ${userId} does not exist`);
    }
    const updated: UserEntity = {
      ...existingUser,
      ...user,
    };
    this.userData.users.set(userId, updated);
    await this.updateUsers();
    return updated;
  }
  async deleteUser(id: string): Promise<void> {
    this.userData.users.delete(id) && (await this.updateUsers());
  }
  async updateUsers() {
    return fs.promises.writeFile(this.usersFilePath, YAML.stringify(UsersFileSchema.parse(this.userData)));
  }
}
