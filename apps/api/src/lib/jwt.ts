import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { RoleEnum } from "@school/shared";

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long");
  }
  return secret;
})();

const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN ?? "8h";

export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: RoleEnum,
  fullName: z.string(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  return JwtPayloadSchema.parse(decoded);
}