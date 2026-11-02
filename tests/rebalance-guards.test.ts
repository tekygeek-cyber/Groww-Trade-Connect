import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustSliderTargets, planRebalanceOrders } from '../src/lib/rebalance-engine';
import type { PortfolioHolding } from '../src/types/portfolio';
import type { TargetAllocation } from '../src/types/rebalance';

const portfolio: PortfolioHolding[] = [
  { id:'a', ticker:'AAA', name:'A', market:'nifty', shares:20, averageBuyPrice:100, buyDate:'2026-01-01' },
  { id:'b', ticker:'BBB', name:'B', market:'nifty', shares:10, averageBuyPrice:100, buyDate:'2026-01-01' },
];
const model = (a = 40, b = 55): TargetAllocation[] => [
  { ticker:'AAA', name:'A', market:'nifty', targetWeightPct:a, isLocked:false },
  { ticker:'BBB', name:'B', market:'nifty', targetWeightPct:b, isLocked:false },
];
const quotes = { AAA: { price:100, change:1, changePct:1 }, BBB:{ price:100, change:-1, changePct:-1 } };

test('locked slider clamps requested share to remaining available budget', () => {
  const t = model(47.5, 47.5); t[0].isLocked = true;
  const next = adjustSliderTargets(t, 'BBB', 90, 5);
  assert.equal(next[0].targetWeightPct, 47.5);
  assert.equal(next[1].targetWeightPct, 47.5);
  assert.equal(next.reduce((sum, x) => sum + x.targetWeightPct, 5), 100);
});
test('impossible all-locked edit is rejected without changing original', () => {
  const t = model(50,45); t[0].isLocked = true; t[1].isLocked = true;
  const next = adjustSliderTargets(t,'AAA',40,5);
  assert.deepEqual(next,t);
});
test('invalid slider inputs cannot create NaN allocations', () => {
  const next = adjustSliderTargets(model(), 'AAA', Number.NaN,5);
  assert.deepEqual(next,model());
});
test('invalid target totals never generate orders', () => {
  const plan = planRebalanceOrders(portfolio, model(70,40), quotes, 100,'nifty',5);
  assert.equal(plan.feasibility,'INFEASIBLE_CONSTRAINTS');
  assert.equal(plan.orders.length,0);
});
test('duplicate targets never generate orders', () => {
  const plan = planRebalanceOrders(portfolio, [model()[0],model()[0]], quotes, 100,'nifty',5);
  assert.equal(plan.feasibility,'INFEASIBLE_CONSTRAINTS');
});
test('missing quotes cause a blocked plan instead of cost-basis fallback', () => {
  const plan = planRebalanceOrders(portfolio,model(),{AAA: quotes.AAA},100,'nifty',5);
  assert.equal(plan.feasibility,'INFEASIBLE_CONSTRAINTS');
  assert.equal(plan.currentScore.compositeScore,null);
});
test('non-INR markets do not consume shared INR cash', () => {
  const nasdaq: PortfolioHolding[] = [{...portfolio[0], market:'nasdaq'}];
  const targets: TargetAllocation[] = [{...model()[0],market:'nasdaq',targetWeightPct:95}];
  const plan=planRebalanceOrders(nasdaq,targets,quotes,350000,'nasdaq',5);
  assert.equal(plan.feasibility,'INFEASIBLE_CONSTRAINTS');
  assert.equal(plan.orders.length,0);
  assert.equal(plan.currentNav,0);
});
test('cash reserve is preserved after fees in generated paper proposals', () => {
  let examined = 0;
  for (let cash = 0; cash <= 500; cash += 5) {
    for (const p of [10, 70, 100, 300]) {
      const customQuotes = {
        AAA: { price:p, change:1, changePct:1 },
        BBB: { price:p / 2, change:1, changePct:1 },
      };
      const plan=planRebalanceOrders(portfolio,model(),customQuotes,cash,'nifty',5);
      if (plan.feasibility !== 'INFEASIBLE_CASH_FLOOR' &&
          plan.feasibility !== 'INFEASIBLE_CONSTRAINTS') {
        assert.ok(plan.projectedCashAfterFills >= plan.requiredCashFloor - 0.006,
          `cash=${cash} p=${p} projected=${plan.projectedCashAfterFills} floor=${plan.requiredCashFloor}`);
        for (const order of plan.orders) {
          assert.ok(order.quantityDelta > 0 && Number.isFinite(order.quantityDelta));
          assert.ok(order.orderNotional > 0 && Number.isFinite(order.orderNotional));
        }
      }
      examined++;
    }
  }
  assert.equal(examined,404);
});
