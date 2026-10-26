// Only public browser configuration is substituted. Server secrets stay in env.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const keys = process.argv.slice(2);
const replacements = keys.map((key) => {
  if (!key.startsWith('NEXT_PUBLIC_')) throw new Error('Only public keys are allowed');
  const value = process.env[key];
  // These URLs, JWT anon keys and EmailJS identifiers require no HTML/JS escaping.
  // Reject any unexpected characters instead of injecting executable content.
  if (!value || !/^[A-Za-z0-9_./:=+\-]+$/.test(value)) {
    throw new Error(`Missing or invalid public configuration: ${key}`);
  }
  const marker = key === 'NEXT_PUBLIC_SUPABASE_URL'
    ? 'https://container-public-supabase.invalid'
    : `__CONTAINER_PUBLIC_${key}__`;
  return [marker, value];
});

async function updateFile(file) {
  const original = await readFile(file, 'utf8');
  let updated = original;
  for (const [marker, value] of replacements) updated = updated.split(marker).join(value);
  if (updated !== original) await writeFile(file, updated);
}
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && /\.(js|json|html|rsc|txt)$/.test(entry.name)) await updateFile(file);
  }
}
await walk('.next');
await updateFile('server.js');
console.info('[container-config] Public configuration initialized');
