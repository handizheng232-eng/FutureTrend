'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets', 'index-v2.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');

assert.match(html, /<select id="em-long">[\s\S]*value="252"[\s\S]*value="504"[\s\S]*value="756"[\s\S]*value="1260"[\s\S]*<\/select>/);
assert.match(html, /<select id="em-short">[\s\S]*value="60"[\s\S]*value="120"[\s\S]*value="252"[\s\S]*<\/select>/);
assert.match(html, /id="em-scatter-title"/);
assert.match(html, /id="em-long-col"/);
assert.match(html, /id="em-short-col"/);

assert.match(app, /emergenceLong:252/);
assert.match(app, /emergenceShort:60/);
assert.match(app, /longHorizon:state\.emergenceLong/);
assert.match(app, /shortHorizon:state\.emergenceShort/);
assert.match(app, /components\.shortTrend|c\.shortTrend/);

console.log('emergence-ui.test.js: PASS');
