import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface LockOptions {
  lockPath?: string;
  staleTimeoutMs?: number;
}

export interface LockMetadata {
  pid: number;
  hostname: string;
  acquiredAt: string;
}

export interface LockHandle {
  acquired: boolean;
  lockPath: string;
  release: () => Promise<void>;
  reason?: string;
}

const DEFAULT_STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_LOCK_FILE = path.join(process.cwd(), 'data', 'topics', '.automation.lock');

/**
 * Attempts to acquire an atomic filesystem lock.
 * If a stale lock is detected (exceeding staleTimeoutMs), it will be broken and re-acquired.
 */
export async function acquireLock(options: LockOptions = {}): Promise<LockHandle> {
  const lockPath = options.lockPath || DEFAULT_LOCK_FILE;
  const staleTimeoutMs = options.staleTimeoutMs || DEFAULT_STALE_TIMEOUT_MS;

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  const metadata: LockMetadata = {
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
  };

  const payload = JSON.stringify(metadata, null, 2);

  // Helper to release lock
  const release = async () => {
    try {
      await fs.unlink(lockPath);
    } catch {
      // Ignored if already removed
    }
  };

  // 1. Try atomic creation
  try {
    await fs.writeFile(lockPath, payload, { flag: 'wx', encoding: 'utf-8' });

    process.once('SIGINT', release);
    process.once('SIGTERM', release);

    return {
      acquired: true,
      lockPath,
      release: async () => {
        process.removeListener('SIGINT', release);
        process.removeListener('SIGTERM', release);
        await release();
      },
    };
  } catch (err: any) {
    if (err?.code !== 'EEXIST') {
      return {
        acquired: false,
        lockPath,
        release: async () => {},
        reason: `Failed to acquire lock due to filesystem error: ${err?.message || 'Unknown error'}`,
      };
    }
  }

  // 2. Lock file exists: check for staleness
  try {
    const raw = await fs.readFile(lockPath, 'utf-8');
    const existingMeta: Partial<LockMetadata> = JSON.parse(raw);
    const acquiredTime = existingMeta.acquiredAt ? Date.parse(existingMeta.acquiredAt) : 0;
    const ageMs = Date.now() - acquiredTime;

    if (!isNaN(ageMs) && ageMs > staleTimeoutMs) {
      // Lock is stale: break and reacquire
      await fs.unlink(lockPath);
      await fs.writeFile(lockPath, payload, { flag: 'wx', encoding: 'utf-8' });

      return {
        acquired: true,
        lockPath,
        release,
      };
    }

    return {
      acquired: false,
      lockPath,
      release: async () => {},
      reason: `Active lock held by PID ${existingMeta.pid || 'unknown'} on host ${existingMeta.hostname || 'unknown'} since ${existingMeta.acquiredAt || 'unknown'}.`,
    };
  } catch (readErr: any) {
    // If reading failed (e.g. corrupt file), attempt to break and reacquire
    try {
      await fs.unlink(lockPath);
      await fs.writeFile(lockPath, payload, { flag: 'wx', encoding: 'utf-8' });
      return {
        acquired: true,
        lockPath,
        release,
      };
    } catch {
      return {
        acquired: false,
        lockPath,
        release: async () => {},
        reason: `Lock file is present and could not be verified: ${readErr?.message || 'Unknown error'}`,
      };
    }
  }
}
