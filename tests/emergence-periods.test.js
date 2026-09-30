'use strict';

const assert = require('node:assert/strict');
const E = require('../assets/trend-engine.js');

function syntheticSeries(length) {
  const d = [], o = [], h = [], l = [], c = [], v = [], p = [];
  for (let i = 0; i < length; i++) {
    const close = 100 + i * 0.025 + Math.sin(i / 17) * 2.5;
    d.push(new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
    o.push(close - 0.2);
    h.push(close + 0.8);
    l.push(close - 0.9);
    c.push(close);
    v.push(1000 + (i % 31) * 17);
    p.push(5000 + i * 3);
  }
  return {d, o, h, l, c, v, p};
}

const longHistory = syntheticSeries(1500);
const configured = E.evaluateEmergence(longHistory, longHistory.c.length - 1, {
  longHorizon: 1260,
  shortHorizon: 120,
});

assert.ok(configured, '1500个观测应足以计算5年×半年度组合');
assert.deepEqual(configured.periods, {
  longHorizon: 1260,
  shortHorizon: 120,
  longMid: 630,
  slopeLookback: 40,
});
assert.ok(Number.isFinite(configured.components.longBias));
assert.ok(Number.isFinite(configured.components.shortTrend));

const insufficient = syntheticSeries(800);
assert.equal(
  E.evaluateEmergence(insufficient, insufficient.c.length - 1, {
    longHorizon: 1260,
    shortHorizon: 60,
  }),
  null,
  '历史短于所选5年窗口时必须返回样本不足，而不是沿用固定252日结果',
);

console.log('emergence-periods.test.js: PASS');
