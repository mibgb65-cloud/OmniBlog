const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 210_000;
const SESSION_DAYS = 30;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal value");
  }

  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );

  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsValue, saltValue, hashValue] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationsValue || !saltValue || !hashValue) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: hexToBytes(saltValue),
        iterations: Number(iterationsValue),
      },
      key,
      256,
    );
    const actual = new Uint8Array(bits);
    const expected = hexToBytes(hashValue);
    if (actual.length !== expected.length) return false;

    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) {
      difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function verifySecret(value: string, expected: string): Promise<boolean> {
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(value)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const actual = new Uint8Array(actualHash);
  const target = new Uint8Array(expectedHash);

  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ target[index];
  }
  return difference === 0;
}

export function sessionExpiry(): number {
  return Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
}

export function slugify(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);

  return base || `post-${crypto.randomUUID().slice(0, 8)}`;
}
