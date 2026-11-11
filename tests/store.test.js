import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransaction } from '../src/expenses.js';
import {
  STORAGE_KEY, LEGACY_STORAGE_KEY, emptyState, loadState, saveState,
  parseBackup, exportBackup,
} from '../src/store.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
}

const legacyExpense = { id: 'legacy-id', description: 'Groceries', amount: 12.50, category: 'Food', date: '2026-11-07' };
const completeState = () => ({
  ...emptyState(),
  transactions: [createTransaction({ ...legacyExpense, type: 'expense' })],
  budgets: { '2026-11': { total: 2000, categories: { 'Food & drink': 300 } } },
});

test('a fresh tracker is empty without automatic demo data or storage writes', () => {
  const target = storage();
  const loaded = loadState(target);
  assert.deepEqual(loaded, { state: emptyState(), warning: null, readOnly: false });
  assert.equal(target.getItem(STORAGE_KEY), null);
});

test('legacy expenses retain IDs and amounts, map category, and keep original storage', () => {
  const raw = JSON.stringify([legacyExpense]);
  const target = storage({ [LEGACY_STORAGE_KEY]: raw });
  const loaded = loadState(target);
  assert.equal(loaded.readOnly, false);
  assert.equal(loaded.state.transactions[0].id, legacyExpense.id);
  assert.equal(loaded.state.transactions[0].amount, legacyExpense.amount);
  assert.equal(loaded.state.transactions[0].category, 'Food & drink');
  assert.equal(target.getItem(STORAGE_KEY), null);
  saveState(loaded.state, target);
  assert.equal(target.getItem(LEGACY_STORAGE_KEY), raw);
  assert.deepEqual(loadState(target).state, loaded.state);
});

test('corrupt or invalid saved data remains intact and blocks accidental overwrite', () => {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    for (const raw of ['{invalid', 'null', '{"unexpected":true}']) {
      const target = storage({ [key]: raw });
      const loaded = loadState(target);
      assert.equal(loaded.readOnly, true);
      assert.match(loaded.warning, /not been overwritten/);
      assert.throws(() => saveState(emptyState(), target), /cannot be read/);
      assert.equal(target.getItem(key), raw);
    }
  }
});

test('explicit restore can recover corrupt storage using a validated backup', () => {
  const target = storage({ [STORAGE_KEY]: '{invalid' });
  const state = completeState();
  const restored = parseBackup(exportBackup(state));
  saveState(restored, target, { replaceCorrupt: true });
  assert.deepEqual(loadState(target).state, state);
});

test('backups reject duplicate IDs, invalid values and budgets before any write', () => {
  const state = completeState();
  const target = storage({ [STORAGE_KEY]: exportBackup(state) });
  const before = target.getItem(STORAGE_KEY);
  for (const candidate of [
    { ...state, currency: 'UNKNOWN' },
    { ...state, transactions: [...state.transactions, ...state.transactions] },
    { ...state, transactions: [{ ...state.transactions[0], date: '2026-02-30' }] },
    { ...state, transactions: [{ ...state.transactions[0], amount: -5 }] },
    { ...state, budgets: { '2026-13': { total: 2000, categories: {} } } },
    { ...state, budgets: { '2026-11': { total: -1, categories: {} } } },
    { ...state, budgets: { '2026-11': { total: 2000, categories: { Unknown: 20 } } } },
  ]) {
    assert.throws(() => parseBackup(JSON.stringify(candidate)));
    assert.throws(() => saveState(candidate, target));
    assert.equal(target.getItem(STORAGE_KEY), before);
  }
});

test('quota and denied storage errors are surfaced without pretending to save', () => {
  const denied = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } };
  assert.equal(loadState(denied).readOnly, true);
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  assert.throws(() => saveState(emptyState(), full), /could not be saved/);
});

test('backup round trip preserves transactions, notes, currency, and monthly budgets', () => {
  const state = completeState();
  state.currency = 'NGN';
  state.transactions[0].note = 'Café receipt';
  state.budgets['2026-12'] = { total: 0, categories: {} };
  assert.deepEqual(parseBackup(exportBackup(state)), state);
});
