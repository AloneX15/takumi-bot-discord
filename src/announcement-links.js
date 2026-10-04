import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// One immutable record per announcement keeps buttons working after restarts.
export function createLinkStore(directory = fileURLToPath(new URL('../.data/announcement-links/', import.meta.url))) {
  return {
    async save(guildId, buttons) {
      const id = randomUUID();
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${id}.json`), JSON.stringify({ guildId, buttons }), { flag: 'wx' });
      return id;
    },
    async load(id) {
      if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) return null;
      try { return JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
  };
}

export const announcementLinks = createLinkStore();
