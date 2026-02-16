import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database.js";
import { config } from "../config/index.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const SALT_ROUNDS = 10;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  username: string;
}

function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshTokenString(): string {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

export async function register(
  username: string,
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: { id: string; username: string; displayName: string }; tokens: TokenPair }> {
  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });

  if (existingUser) {
    if (existingUser.username === username) {
      throw new ValidationError("Username already taken");
    }
    throw new ValidationError("Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { username, email, passwordHash, displayName },
  });

  const tokens = await createTokenPair({ userId: user.id, username: user.username });

  return {
    user: { id: user.id, username: user.username, displayName: user.displayName },
    tokens,
  };
}

export async function login(email: string, password: string): Promise<{ user: { id: string; username: string; displayName: string }; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AuthenticationError("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AuthenticationError("Invalid email or password");
  }

  const tokens = await createTokenPair({ userId: user.id, username: user.username });

  return {
    user: { id: user.id, username: user.username, displayName: user.displayName },
    tokens,
  };
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
    }
    throw new AuthenticationError("Invalid or expired refresh token");
  }

  // Rotate: delete old, create new
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  return createTokenPair({ userId: stored.user.id, username: stored.user.username });
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    throw new AuthenticationError("Invalid or expired token");
  }
}

async function createTokenPair(payload: JwtPayload): Promise<TokenPair> {
  const accessToken = generateAccessToken(payload);
  const refreshTokenStr = generateRefreshTokenString();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      token: refreshTokenStr,
      userId: payload.userId,
      expiresAt,
    },
  });

  return { accessToken, refreshToken: refreshTokenStr };
}
