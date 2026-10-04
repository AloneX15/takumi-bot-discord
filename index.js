import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

try {
  loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
} catch (error) {
  // El alojamiento puede proporcionar las variables sin un archivo .env.
  if (error.code !== 'ENOENT') throw error;
}

await import('./src/index.js');
