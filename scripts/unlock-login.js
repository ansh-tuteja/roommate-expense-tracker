#!/usr/bin/env node
// Usage: node scripts/unlock-login.js --email user@example.com
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const redis = require('../lib/redis');

const LOGIN_FAIL_KEY_PREFIX = 'expensehub:login:fail:';
const LOGIN_LOCK_KEY_PREFIX = 'expensehub:login:lock:';

function normalize(email = '') { return email.trim().toLowerCase(); }
function buildFailedKey(identifier) { return `${LOGIN_FAIL_KEY_PREFIX}${identifier}`; }
function buildLockKey(identifier) { return `${LOGIN_LOCK_KEY_PREFIX}${identifier}`; }

async function main() {
  const argIdx = process.argv.indexOf('--email');
  const email = argIdx > -1 ? process.argv[argIdx + 1] : null;
  if (!email) {
    console.error('Error: --email is required');
    process.exit(1);
  }
  const id = normalize(email);
  const delKeys = [buildFailedKey(id), buildLockKey(id)];
  try {
    const results = await redis.del(delKeys);
    console.log('Unlock results:', { email: id, deleted: results });
    process.exit(0);
  } catch (e) {
    console.error('Failed to unlock:', e);
    process.exit(2);
  }
}

main();
