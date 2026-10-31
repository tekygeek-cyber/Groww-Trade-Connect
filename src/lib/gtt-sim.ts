import type { GttRow } from '../types/market';

const READY = 'Ready to place dummy buy GTT.';
const CREATED = 'Dummy buy GTT placed (simulation only).';
const SKIP_DAY = 'Skipped: an open buy order already exists today.';
const SKIP_GTT = 'Skipped: an active buy GTT already exists.';
const SKIP_DUMMY = 'Skipped: a dummy buy GTT is already active.';
const SKIP_QTY = 'Skipped: existing position/holding quantity is {qty}.';
const WAIT_LTP = 'Waiting for LTP.';
const NO_PRICE = 'Buy price is not available for this row.';
const BAD_TICK = 'Trigger price should be a multiple of tick size.';

export function roundToTick(price: number, tick: number): number | null {
  if (tick <= 0 || price <= 0 || !Number.isFinite(price) || !Number.isFinite(tick)) return null;
  const factor = 1 / tick;
  return Math.round(price * factor) / factor;
}

export function evaluateGtt(
  candidate: { symbol: string; buy_price?: number | null; last_price?: number | null; tick_size?: number },
  snapshot: {
    positions?: Array<{ trading_symbol?: string; symbol?: string; quantity?: number; net_quantity?: number }>;
    holdings?: Array<{ trading_symbol?: string; symbol?: string; quantity?: number; holding_quantity?: number }>;
    orders?: Array<{ trading_symbol?: string; symbol?: string; transaction_type?: string; status?: string; order_id?: string }>;
    smart_orders?: Array<{ trading_symbol?: string; symbol?: string; transaction_type?: string; status?: string; smart_order_id?: string }>;
  },
  dummies: Array<{ id: string; symbol: string; status: string; transaction_type: string }>,
  tick: number = 0.05,
): GttRow {
  const symbol = (candidate.symbol || '').trim().toUpperCase();
  const row: GttRow = {
    symbol,
    quantity: 1,
    buy_price: null,
    stoploss: null,
    tick_size: tick,
    last_price: candidate.last_price != null && Number.isFinite(candidate.last_price) ? candidate.last_price : null,
    account_state: 'unknown',
    position_quantity: 0,
    active_buy_trigger_id: null,
    active_stoploss_trigger_id: null,
    day_buy_order_id: null,
    day_buy_order_status: null,
    buy_status: 'invalid',
    buy_trigger_id: null,
    stoploss_status: null,
    stoploss_trigger_id: null,
    message: NO_PRICE,
  };

  const rawBuy = candidate.buy_price;
  if (rawBuy == null || !Number.isFinite(rawBuy) || rawBuy <= 0) {
    row.buy_status = 'invalid';
    row.message = NO_PRICE;
    return row;
  }

  const buy = roundToTick(rawBuy, tick);
  if (buy == null) {
    row.buy_status = 'invalid';
    row.message = BAD_TICK;
    return row;
  }

  const stop = roundToTick(buy * 0.95, tick);
  if (stop == null) {
    row.buy_status = 'invalid';
    row.message = BAD_TICK;
    return row;
  }

  row.buy_price = buy;
  row.stoploss = stop;
  row.stoploss_status = 'planned_after_buy';

  let positionQty = 0;
  for (const bucket of [snapshot.positions ?? [], snapshot.holdings ?? []]) {
    for (const item of bucket as any[]) {
      const sym = (item.trading_symbol || item.symbol || '').toUpperCase();
      if (sym === symbol) {
        positionQty += item.quantity ?? item.net_quantity ?? item.holding_quantity ?? 0;
      }
    }
  }
  row.position_quantity = positionQty;

  // Real GTT
  const realGtt = (snapshot.smart_orders ?? []).find((item) => {
    const sym = (item.trading_symbol || item.symbol || '').toUpperCase();
    const side = (item.transaction_type || 'BUY').toUpperCase();
    const status = (item.status || '').toUpperCase();
    return sym === symbol && side === 'BUY' && (status === '' || status === 'ACTIVE');
  });
  if (realGtt) {
    row.account_state = 'blocked';
    row.buy_status = 'already_active';
    row.active_buy_trigger_id = realGtt.smart_order_id || null;
    row.message = SKIP_GTT;
    return row;
  }

  // Active dummy GTT
  const dummy = dummies.find(
    (d) => d.symbol.toUpperCase() === symbol && d.status.toUpperCase() === 'ACTIVE' && d.transaction_type.toUpperCase() === 'BUY',
  );
  if (dummy) {
    row.account_state = 'already_active';
    row.buy_status = 'already_active';
    row.active_buy_trigger_id = dummy.id;
    row.buy_trigger_id = dummy.id;
    row.message = SKIP_DUMMY;
    return row;
  }

  // Day order check
  const dayOrder = (snapshot.orders ?? []).find((item) => {
    const sym = (item.trading_symbol || item.symbol || '').toUpperCase();
    const side = (item.transaction_type || '').toUpperCase();
    const status = (item.status || '').toUpperCase();
    return sym === symbol && side === 'BUY' && !['CANCELLED', 'REJECTED', 'CANCELED'].includes(status);
  });
  if (dayOrder) {
    row.account_state = 'blocked';
    row.buy_status = 'blocked';
    row.day_buy_order_id = dayOrder.order_id || null;
    row.day_buy_order_status = dayOrder.status || null;
    row.message = SKIP_DAY;
    return row;
  }

  if (positionQty > 0) {
    row.account_state = 'blocked';
    row.buy_status = 'blocked';
    row.message = SKIP_QTY.replace('{qty}', String(positionQty));
    return row;
  }

  if (row.last_price == null || row.last_price <= 0) {
    row.account_state = 'waiting';
    row.buy_status = 'waiting';
    row.message = WAIT_LTP;
    return row;
  }

  row.account_state = 'clear';
  row.buy_status = 'ready';
  row.message = READY;
  return row;
}

export function createDummyOrders(
  candidates: Array<{ symbol: string; buy_price?: number | null; last_price?: number | null; tick_size?: number }>,
  snapshot: any,
  ticks: Record<string, number>,
  existingDummies: any[],
): { rows: GttRow[]; updatedDummies: any[] } {
  const dummies = [...existingDummies];
  const results: GttRow[] = [];

  for (const candidate of candidates) {
    const tick = ticks[candidate.symbol] ?? candidate.tick_size ?? 0.05;
    const decision = evaluateGtt(candidate, snapshot, dummies, tick);
    if (decision.buy_status !== 'ready' || decision.buy_price == null) {
      results.push(decision);
      continue;
    }

    const triggerId = 'DUMMY-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    const record = {
      id: triggerId,
      symbol: decision.symbol,
      trigger_price: decision.buy_price,
      order_price: decision.buy_price,
      product: 'CNC',
      exchange: 'NSE',
      transaction_type: 'BUY',
      quantity: 1,
      order_type: 'LIMIT',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    dummies.push(record);
    decision.buy_status = 'created';
    decision.buy_trigger_id = triggerId;
    decision.active_buy_trigger_id = triggerId;
    decision.account_state = 'already_active';
    decision.stoploss_status = 'planned_after_buy';
    decision.stoploss_trigger_id = null;
    decision.message = CREATED;
    results.push(decision);
  }

  return { rows: results, updatedDummies: dummies };
}
