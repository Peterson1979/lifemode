import { timingSafeEqual } from 'node:crypto';

export function isApprovalAuthorizationValid(header: string | undefined, expectedToken: string): boolean {
  const prefix = 'Bearer ';
  if (!header?.startsWith(prefix) || !expectedToken) return false;
  const received = Buffer.from(header.slice(prefix.length), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
