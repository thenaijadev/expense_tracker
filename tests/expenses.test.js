
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  totalExpenses,
  categoryTotals,
  addExpense
} from '../src/expenses.js';

const expenses = [
  { amount: 15, category: 'Food' },
  { amount: 45, category: 'Food' },
  { amount: 3, category: 'Transport' }
];

test('calculates total expenses', () => {
  assert.equal(totalExpenses(expenses), 63);
});

test('calculates spending by category', () => {
  assert.deepEqual(categoryTotals(expenses), {
    Food: 60,
    Transport: 3
  });
});

test('rejects negative expenses', () => {
  assert.throws(
    () => addExpense([], { amount: -5 }),
    /positive/
  );
});
