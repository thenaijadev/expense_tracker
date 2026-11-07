
import './style.css';
import Chart from 'chart.js/auto';
import { format, parseISO } from 'date-fns';

import {
  loadExpenses,
  saveExpenses,
  addExpense,
  removeExpense,
  totalExpenses,
  categoryTotals
} from './expenses.js';

const form = document.querySelector('#expense-form');
const list = document.querySelector('#expense-list');
const total = document.querySelector('#total');
const canvas = document.querySelector('#category-chart');

let expenses = loadExpenses();
let chart;

function render() {
  list.replaceChildren();

  for (const expense of [...expenses].reverse()) {
    const item = document.createElement('li');
    const details = document.createElement('span');
    const deleteButton = document.createElement('button');

    const date = format(parseISO(expense.date), 'MMM d, yyyy');

    details.textContent =
      `${expense.description} — ${expense.amount.toFixed(2)} ` +
      `(${expense.category}, ${date})`;

    deleteButton.textContent = 'Delete';

    deleteButton.addEventListener('click', () => {
      expenses = removeExpense(expenses, expense.id);
      saveExpenses(expenses);
      render();
    });

    item.append(details, deleteButton);
    list.append(item);
  }

  total.textContent = totalExpenses(expenses).toFixed(2);

  const totals = categoryTotals(expenses);

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(totals),
      datasets: [{
        label: 'Spending',
        data: Object.values(totals)
      }]
    }
  });
}

form.addEventListener('submit', event => {
  event.preventDefault();

  const entry = Object.fromEntries(new FormData(form));

  expenses = addExpense(expenses, entry);
  saveExpenses(expenses);

  form.reset();
  render();
});

render();
