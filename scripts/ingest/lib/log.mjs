import fs from 'fs';
import path from 'path';

const LOG_PATH = path.resolve(process.cwd(), 'ingest.log');

export function logIngest(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  fs.appendFileSync(LOG_PATH, `${line}\n`);
  console.log(line);
}
