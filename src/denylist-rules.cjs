'use strict';
// Scan rules as regular expressions. The documents describe them in words so they do not trip the scan.
const drive = '[A-Za-z]:';
const sep = '[\\\\/]';
const KEY_RULES = [
  ['key-openai', /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}/],
  ['key-anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['key-google', /AIza[0-9A-Za-z_-]{35}/],
  ['key-bearer', /Bearer\s+[A-Za-z0-9._~+/=-]{30,}/],
  ['key-header', /(x-api-key|x-goog-api-key)['"]?\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i]
];
const PATH_RULES = [
  ['path-windows-home', new RegExp(drive + sep + 'Users' + sep + '[^\\s\\\\/]+', 'i')],
  ['path-posix-home', new RegExp('(^|[^A-Za-z0-9_.])/(home|Users)/[A-Za-z0-9_.-]+')]
];
const BANNED_PHRASES = ['in production', 'deployed at', 'used by', 'adoption', 'customers', 'users'];
const BANNED_CAUSAL = /\b(cause[sd]?|leads? to|result(s|ed)? in)\s+(returns|complaints)/i;
const ALLOW_SENTENCES = [
  'There are no users, no production deployment and no adoption.',
  'generally believed to cause returns and complaints; this project does not measure that'
];
const HONESTY = 'Built with AI coding agents; Anirudh wrote the spec, gates and reviews.';
const REVIEW = 'Design reviews were run by AI review agents; the owner decided which findings to accept.';
const PUBLISHABLE = ['README.md', 'docs/EVAL-REPORT.md', 'docs/CASE-STUDY.md', 'docs/DATA-SOURCES.md', 'DATA-SOURCES.md'];
const PUBLISHABLE_DIRS = ['demo/'];
const HONESTY_FILES = ['README.md', 'docs/PRD.md', 'docs/SPEC.md', 'docs/DATA-PLAN.md', 'docs/EVAL-REPORT.md', 'docs/CASE-STUDY.md', 'demo/index.html', 'demo/live.html'];
const REVIEW_FILES = ['README.md', 'docs/CASE-STUDY.md', 'docs/EVAL-REPORT.md'];
module.exports = { KEY_RULES, PATH_RULES, BANNED_PHRASES, BANNED_CAUSAL, ALLOW_SENTENCES, HONESTY, REVIEW, PUBLISHABLE, PUBLISHABLE_DIRS, HONESTY_FILES, REVIEW_FILES };