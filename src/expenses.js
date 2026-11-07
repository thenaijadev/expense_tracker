
const STORAGE_KEY = 'expense-tracker-expenses';

export function loadExpenses() {
  try {
    const data = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveExpenses(expenses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

export function addExpense(expenses, entry) {
  const amount = Number(entry.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be positive');
  }

  return [...expenses, {
    id: crypto.randomUUID(),
    description: entry.description,
    amount,
    category: entry.category,
    date: entry.date
  }];
}

export function removeExpense(expenses, id) {
  return expenses.filter(expense => expense.id !== id);
}

export function totalExpenses(expenses) {
  return expenses.reduce(
    (sum, expense) => sum + expense.amount, 0
  );
}

export function categoryTotals(expenses) {
  return expenses.reduce((totals, expense) => {
    totals[expense.category] =
      (totals[expense.category] || 0) + expense.amount;
    return totals;
  }, {});
}
