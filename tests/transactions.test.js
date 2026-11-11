import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTransaction, updateTransaction, filterTransactions, summarizeMonth,
  dailySpending, serializeCSV, createDemoTransactions, todayISO, currentMonth,
} from '../src/expenses.js';

const entry = overrides => createTransaction({
  id: 'one', description: 'Groceries', amount: 15.20, category: 'Food & drink',
  type: 'expense', date: '2026-11-07', note: '', ...overrides,
});

test('rejects invalid money, dates, empty descriptions and mismatched categories', () => {
  for (const amount of [0, -1, NaN, Infinity, 1.234, '', '1e3', '12.345']) {
    assert.throws(() => entry({ amount }));
  }
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', 'not-a-date']) {
    assert.throws(() => entry({ date }), /valid date/);
  }
  assert.equal(entry({ date: '2024-02-29' }).date, '2024-02-29');
  assert.throws(() => entry({ description: '   ' }), /Description/);
  assert.throws(() => entry({ type: 'income', category: 'Shopping' }), /category/);
  assert.equal(entry({ amount: ' 12.30 ', description: '  Lunch  ' }).description, 'Lunch');
});

test('monthly totals use cents, isolate month/year, and compare previous month', () => {
  const transactions = [
    entry({ id: 'a', date: '2027-01-01', amount: 0.1 }),
    entry({ id: 'b', date: '2027-01-02', amount: 0.2 }),
    entry({ id: 'c', date: '2027-01-03', amount: 1, type: 'income', category: 'Salary' }),
    entry({ id: 'd', date: '2026-12-20', amount: 8 }),
    entry({ id: 'e', date: '2026-01-20', amount: 99 }),
  ];
  assert.deepEqual(summarizeMonth(transactions, '2027-01'), {
    income: 1, expenses: 0.3, balance: 0.7, count: 3,
    byCategory: { 'Food & drink': 0.3 }, previousExpenses: 8,
  });
});

test('editing retains ID and leaves original array untouched', () => {
  const original = [entry()];
  const next = updateTransaction(original, 'one', { ...original[0], amount: 20, description: 'Weekly groceries' });
  assert.equal(next[0].id, 'one');
  assert.equal(next[0].amount, 20);
  assert.equal(original[0].amount, 15.2);
  assert.throws(() => updateTransaction(original, 'missing', original[0]), /no longer exists/);
});

test('filters combine search, month, category and type without altering source order', () => {
  const transactions = [
    entry({ id: 'a', description: 'Lunch', amount: 20 }),
    entry({ id: 'b', description: 'Bus', amount: 3, category: 'Transport', date: '2026-11-09' }),
    entry({ id: 'c', description: 'Lunch', amount: 5, date: '2026-10-09' }),
    entry({ id: 'd', description: 'Payday', amount: 100, type: 'income', category: 'Salary' }),
  ];
  assert.deepEqual(filterTransactions(transactions, { month: '2026-11', search: 'LUNCH', category: 'Food & drink', type: 'expense' }).map(item => item.id), ['a']);
  assert.deepEqual(filterTransactions(transactions, { month: 'all', type: 'expense', sort: 'lowest' }).map(item => item.id), ['b', 'c', 'a']);
  assert.deepEqual(transactions.map(item => item.id), ['a', 'b', 'c', 'd']);
});

test('daily chart handles leap years and excludes income', () => {
  const transactions = [
    entry({ date: '2024-02-29', amount: 0.1 }),
    entry({ id: 'b', date: '2024-02-29', amount: 0.2 }),
    entry({ id: 'c', date: '2024-02-29', amount: 10, type: 'income', category: 'Salary' }),
  ];
  const daily = dailySpending(transactions, '2024-02');
  assert.equal(daily.labels.length, 29);
  assert.equal(daily.values[28], 0.3);
  assert.equal(daily.values[0], 0);
});

test('CSV escapes quotes/newlines and protects spreadsheet formula injection', () => {
  const csv = serializeCSV([entry({ description: '=HYPERLINK("https://example.org")', note: 'Line one,\n"Line two"' })]);
  assert.ok(csv.startsWith('\uFEFF"Date"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.org"")"'));
  assert.ok(csv.includes('"Line one,\n""Line two"""'));
  assert.ok(csv.includes('"15.20"'));
  const withCurrency = serializeCSV([entry()], 'NGN');
  assert.ok(withCurrency.includes('"Currency"'));
  assert.ok(withCurrency.includes('"NGN"'));
});

test('local date helpers avoid UTC date shifts and demo data stays explicitly generated', () => {
  const local = new Date(2026, 10, 7, 23, 59);
  assert.equal(todayISO(local), '2026-11-07');
  assert.equal(currentMonth(local), '2026-11');
  const demo = createDemoTransactions('2026-11');
  assert.equal(new Set(demo.map(item => item.id)).size, demo.length);
  assert.ok(demo.some(item => item.type === 'income'));
  assert.ok(summarizeMonth(demo, '2026-11').expenses > 0);
  assert.ok(summarizeMonth(demo, '2026-11').previousExpenses > 0);
});
