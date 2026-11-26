'use strict';
// The only logger. Every string passes through secrets.redact.
const { redact } = require('./secrets.cjs');
const out = (stream, level, msg) => stream.write(`[${level}] ${redact(msg)}\n`);
module.exports = {
  info: (m) => out(process.stderr, 'info', m),
  warn: (m) => out(process.stderr, 'warn', m),
  error: (m) => out(process.stderr, 'error', m),
  line: (m) => process.stdout.write(redact(m) + '\n')
};