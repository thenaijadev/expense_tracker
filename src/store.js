import { createTransaction, EXPENSE_CATEGORIES, moneyToCents, validMonth } from './expenses.js';

export const STORAGE_KEY = 'expense-tracker-state-v2';
export const LEGACY_STORAGE_KEY = 'expense-tracker-expenses';
export const CURRENCIES = Object.freeze(['EUR', 'USD', 'GBP', 'NGN', 'CAD', 'AUD']);
const MAX_TRANSACTIONS = 10000;
const MAX_BACKUP_LENGTH = 10000000;

export function emptyState() {
  return { version: 2, transactions: [], currency: 'EUR', budgets: {} };
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateState(value) {
  if (!object(value) || value.version !== 2 || !Array.isArray(value.transactions)) {
    throw new Error('Choose a valid expense tracker backup (version 2).');
  }
  if (value.transactions.length > MAX_TRANSACTIONS) throw new Error('This backup exceeds the 10,000 transaction limit.');
  if (!CURRENCIES.includes(value.currency)) throw new Error('The backup contains an unsupported currency.');
  const ids = new Set();
  const transactions = value.transactions.map((item, index) => {
    if (!object(item) || typeof item.id !== 'string') throw new Error(`Transaction ${index + 1} has no valid ID.`);
    const transaction = createTransaction(item);
    if (ids.has(transaction.id)) throw new Error('The backup contains duplicate transaction IDs.');
    ids.add(transaction.id);
    return transaction;
  });
  if (!object(value.budgets)) throw new Error('The backup contains invalid budgets.');
  const budgets = {};
  for (const [month, budget] of Object.entries(value.budgets)) {
    if (!validMonth(month) || !object(budget) || !object(budget.categories)) throw new Error('The backup contains an invalid monthly budget.');
    const categories = {};
    for (const [category, amount] of Object.entries(budget.categories)) {
      if (!EXPENSE_CATEGORIES.includes(category)) throw new Error('The backup contains an unknown budget category.');
      categories[category] = moneyToCents(amount, { allowZero: true }) / 100;
    }
    budgets[month] = { total: moneyToCents(budget.total, { allowZero: true }) / 100, categories };
  }
  return { version: 2, transactions, currency: value.currency, budgets };
}

export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_LENGTH) throw new Error('Choose a JSON backup smaller than 10 MB.');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON. Choose an expense tracker backup.'); }
  return validateState(parsed);
}

export function exportBackup(state) {
  return JSON.stringify(validateState(state), null, 2) + '\n';
}

function readLegacy(raw) {
  let items;
  try { items = JSON.parse(raw); }
  catch { throw new Error('Existing expenses cannot be read.'); }
  if (!Array.isArray(items) || items.length > MAX_TRANSACTIONS) throw new Error('Existing expenses have an invalid format.');
  const ids = new Set();
  const transactions = items.map(item => {
    if (!object(item)) throw new Error('An existing expense is invalid.');
    const next = createTransaction({ ...item, type: 'expense' });
    if (ids.has(next.id)) throw new Error('Existing expenses contain duplicate IDs.');
    ids.add(next.id);
    return next;
  });
  return { ...emptyState(), transactions };
}

function getStorage(storage) {
  try { return storage ?? globalThis.localStorage; }
  catch { throw new Error('Browser storage is unavailable. Allow local storage to save your changes.'); }
}

export function loadState(storage) {
  try {
    const target = getStorage(storage);
    if (!target) throw new Error('Browser storage is unavailable.');
    const current = target.getItem(STORAGE_KEY);
    if (current !== null) {
      return { state: parseBackup(current), warning: null, readOnly: false };
    }
    const legacy = target.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      const state = readLegacy(legacy);
      return { state, warning: state.transactions.length ? 'Your existing expenses have been preserved in the updated tracker.' : null, readOnly: false };
    }
    return { state: emptyState(), warning: null, readOnly: false };
  } catch (error) {
    return {
      state: emptyState(),
      warning: `Your saved data could not be loaded. It has not been overwritten. ${error.message} Restore a valid backup in Settings to recover.`,
      readOnly: true,
    };
  }
}

export function saveState(state, storage, { replaceCorrupt = false } = {}) {
  const normalized = validateState(state);
  const target = getStorage(storage);
  if (!target) throw new Error('Browser storage is unavailable. Changes were not saved.');
  try {
    if (!replaceCorrupt) {
      const current = target.getItem(STORAGE_KEY);
      if (current !== null) parseBackup(current);
      else {
        const legacy = target.getItem(LEGACY_STORAGE_KEY);
        if (legacy !== null) readLegacy(legacy);
      }
    }
  } catch {
    throw new Error('Existing saved data cannot be read. Restore a valid backup in Settings before making changes.');
  }
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    throw new Error('Changes could not be saved. Browser storage may be full or disabled. Export a backup and free some space.');
  }
  return normalized;
}
