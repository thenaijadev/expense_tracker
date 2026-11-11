export const EXPENSE_CATEGORIES = Object.freeze([
  'Food & drink', 'Transport', 'Shopping', 'Bills & utilities', 'Home',
  'Health', 'Entertainment', 'Education', 'Other',
]);
export const INCOME_CATEGORIES = Object.freeze([
  'Salary', 'Freelance', 'Gifts', 'Refunds', 'Other income',
]);
export const MAX_AMOUNT = 999999999.99;

export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function currentMonth(date = new Date()) {
  return todayISO(date).slice(0, 7);
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000;
}

export function moneyToCents(value, { allowZero = false } = {}) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+(\.\d{1,2})?$/.test(value.trim()))) {
    throw new Error('Enter an amount with no more than two decimal places.');
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(allowZero ? 'Amount must be zero or positive.' : 'Amount must be positive.');
  }
  if (amount > MAX_AMOUNT) throw new Error('Amount is too large.');
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 0.00001) {
    throw new Error('Enter an amount with no more than two decimal places.');
  }
  return cents;
}

function cleanText(value, name, max, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || (!optional && !value.trim())) {
    throw new Error(`${name} is required.`);
  }
  const text = value.trim();
  if (text.length > max) throw new Error(`${name} must be ${max} characters or fewer.`);
  return text;
}

export function createTransaction(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid transaction.');
  const amount = moneyToCents(entry.amount) / 100;
  const type = entry.type ?? 'expense';
  if (!['expense', 'income'].includes(type)) throw new Error('Choose expense or income.');
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const category = entry.category === 'Food' && type === 'expense' ? 'Food & drink' : entry.category;
  if (!categories.includes(category)) throw new Error('Choose a category for this transaction type.');
  if (!validDate(entry.date)) throw new Error('Enter a valid date.');
  const id = entry.id ?? crypto.randomUUID();
  if (typeof id !== 'string' || !id.trim() || id.length > 100) throw new Error('Invalid transaction ID.');
  return {
    id,
    description: cleanText(entry.description, 'Description', 120),
    amount,
    type,
    category,
    date: entry.date,
    note: cleanText(entry.note, 'Note', 500, true),
  };
}

export function updateTransaction(transactions, id, entry) {
  if (!transactions.some(item => item.id === id)) throw new Error('This transaction no longer exists.');
  const transaction = createTransaction({ ...entry, id });
  return transactions.map(item => item.id === id ? transaction : item);
}

export function filterTransactions(transactions, { month = '', search = '', type = '', category = '', sort = 'newest' } = {}) {
  const query = search.trim().toLocaleLowerCase();
  const results = transactions.filter(item => (
    (!month || month === 'all' || item.date.startsWith(`${month}-`)) &&
    (!type || type === 'all' || item.type === type) &&
    (!category || category === 'all' || item.category === category) &&
    (!query || `${item.description} ${item.note || ''} ${item.category}`.toLocaleLowerCase().includes(query))
  ));
  const newest = (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
  return results.sort({
    oldest: (a, b) => -newest(a, b),
    highest: (a, b) => b.amount - a.amount || newest(a, b),
    lowest: (a, b) => a.amount - b.amount || newest(a, b),
    newest,
  }[sort] || newest);
}

function sumAmounts(items) {
  return items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;
}

export function previousMonth(month) {
  if (!validMonth(month)) throw new Error('Invalid month.');
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${String(year - 1).padStart(4, '0')}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

export function summarizeMonth(transactions, month) {
  if (!validMonth(month)) throw new Error('Invalid month.');
  const items = transactions.filter(item => item.date.startsWith(`${month}-`));
  const expenses = items.filter(item => item.type !== 'income');
  const income = sumAmounts(items.filter(item => item.type === 'income'));
  const spent = sumAmounts(expenses);
  const categoryCents = {};
  for (const item of expenses) {
    categoryCents[item.category] = (categoryCents[item.category] || 0) + Math.round(item.amount * 100);
  }
  const previous = previousMonth(month);
  return {
    income,
    expenses: spent,
    balance: (Math.round(income * 100) - Math.round(spent * 100)) / 100,
    count: items.length,
    byCategory: Object.fromEntries(Object.entries(categoryCents).map(([category, cents]) => [category, cents / 100])),
    previousExpenses: sumAmounts(transactions.filter(item => item.type !== 'income' && item.date.startsWith(`${previous}-`))),
  };
}

export function dailySpending(transactions, month) {
  if (!validMonth(month)) throw new Error('Invalid month.');
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cents = Array(days).fill(0);
  for (const item of transactions) {
    if (item.type !== 'income' && item.date.startsWith(`${month}-`)) {
      cents[Number(item.date.slice(8)) - 1] += Math.round(item.amount * 100);
    }
  }
  return { labels: Array.from({ length: days }, (_, i) => String(i + 1)), values: cents.map(value => value / 100) };
}

function csvCell(value) {
  let text = String(value ?? '');
  // Avoid formulas when this CSV is opened in Excel, Calc, or another spreadsheet.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializeCSV(transactions, currency) {
  const rows = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Note']];
  if (currency) rows[0].push('Currency');
  for (const item of transactions) {
    const row = [item.date, item.type, item.description, item.category, item.amount.toFixed(2), item.note || ''];
    if (currency) row.push(currency);
    rows.push(row);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function createDemoTransactions(month = currentMonth()) {
  if (!validMonth(month)) throw new Error('Invalid month.');
  const records = [
    [1, 'Monthly salary', 3200, 'Salary', 'income', 'Payday'],
    [2, 'Apartment rent', 850, 'Home', 'expense', 'Monthly rent'],
    [3, 'Weekly groceries', 68.45, 'Food & drink', 'expense', 'Fresh produce and pantry essentials'],
    [4, 'Metro pass', 42.5, 'Transport', 'expense', 'Monthly travel pass'],
    [5, 'Coffee with friends', 12.8, 'Food & drink', 'expense', 'Saturday catch-up'],
    [6, 'Internet & electricity', 96, 'Bills & utilities', 'expense', 'Household bills'],
    [7, 'Design project', 450, 'Freelance', 'income', 'Side project payment'],
    [8, 'Running shoes', 89, 'Shopping', 'expense', ''],
    [10, 'Cinema night', 24, 'Entertainment', 'expense', ''],
    [12, 'Weekly groceries', 54.2, 'Food & drink', 'expense', ''],
    [14, 'Online course', 39, 'Education', 'expense', 'Learning something new'],
    [16, 'Pharmacy', 18.6, 'Health', 'expense', ''],
    [18, 'Dinner out', 46.5, 'Food & drink', 'expense', ''],
    [21, 'Train ticket', 28.9, 'Transport', 'expense', 'Weekend trip'],
    [24, 'Weekly groceries', 62.3, 'Food & drink', 'expense', ''],
    [26, 'Bookshop', 16.5, 'Shopping', 'expense', ''],
  ];
  const previous = previousMonth(month);
  return records.map(([day, description, amount, category, type, note], index) => createTransaction({
    id: `demo-${month}-${index}`, description, amount, category, type, note,
    date: `${month}-${String(day).padStart(2, '0')}`,
  })).concat([
    createTransaction({ id: `demo-${previous}-salary`, description: 'Monthly salary', amount: 3200, category: 'Salary', type: 'income', date: `${previous}-01` }),
    createTransaction({ id: `demo-${previous}-rent`, description: 'Apartment rent', amount: 850, category: 'Home', type: 'expense', date: `${previous}-02` }),
    createTransaction({ id: `demo-${previous}-food`, description: 'Groceries & dining', amount: 420, category: 'Food & drink', type: 'expense', date: `${previous}-15` }),
    createTransaction({ id: `demo-${previous}-transport`, description: 'Travel', amount: 145, category: 'Transport', type: 'expense', date: `${previous}-20` }),
    createTransaction({ id: `demo-${previous}-shopping`, description: 'Home essentials', amount: 265, category: 'Shopping', type: 'expense', date: `${previous}-23` }),
  ]);
}

// Keep the original pure helper API available to existing callers.
export function addExpense(expenses, entry) {
  return [...expenses, createTransaction({ ...entry, type: 'expense' })];
}
export function removeExpense(expenses, id) {
  return expenses.filter(item => item.id !== id);
}
export function totalExpenses(expenses) {
  return sumAmounts(expenses.filter(item => item.type !== 'income'));
}
export function categoryTotals(expenses) {
  const totals = {};
  for (const item of expenses.filter(item => item.type !== 'income')) {
    totals[item.category] = (totals[item.category] || 0) + Math.round(item.amount * 100);
  }
  return Object.fromEntries(Object.entries(totals).map(([key, cents]) => [key, cents / 100]));
}
