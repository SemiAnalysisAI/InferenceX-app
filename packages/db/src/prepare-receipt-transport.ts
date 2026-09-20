import fs from 'node:fs';
import path from 'node:path';
import { prepareReceiptTransport } from './lib/receipt-transport';
const root = process.env.RECEIPT_TRANSPORT_PATH;
const output = process.env.GITHUB_ENV;
if (!root || !output) throw new Error('RECEIPT_TRANSPORT_PATH and GITHUB_ENV are required');
const values = prepareReceiptTransport(process.env, path.resolve(root));
for (const [key, value] of Object.entries(values)) {
  if (/[\r\n]/u.test(value)) throw new Error('Invalid transport environment value');
  fs.appendFileSync(output, `${key}=${value}\n`);
}
