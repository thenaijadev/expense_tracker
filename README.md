# Expense Tracker

A responsive personal finance app built with JavaScript, Vite, Chart.js, and date-fns.
REPO: https://github.com/thenaijadev/expense_tracker
## Run locally

Requires Node.js 22.12.0 or newer and npm. From the project folder:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

```bash
npm test          # Domain and storage regression tests
npm run build    # Production bundle in dist/
npm run preview  # Serve the production build locally
```

The committed lockfile keeps dependency installation reproducible. Vite's build configuration is in `vite.config.js`; package metadata and scripts are in `package.json`.

## Features

- Expense and income entries with categories, dates, and notes; edit, delete, and undo.
- Monthly income, spending, balance, category breakdowns, and daily spending charts.
- Monthly and category budgets with progress indicators.
- Search, filter, and sort transactions; export the current results as CSV.
- JSON backup and restore for transactions, currency, and budgets.
- Optional sample-data mode that does not replace saved personal data.
- Responsive desktop and mobile layouts with labelled forms and keyboard navigation.

## Data and privacy

Data stays in this browser's local storage. There is no account, server database, bank connection, or cross-device sync. Use JSON backups before clearing browser data or changing devices. A different browser, hostname, or port has separate storage.

Existing entries under `expense-tracker-expenses` are loaded automatically; their original storage is retained. Updates use `expense-tracker-state-v2`. Invalid saved data triggers a visible warning and blocks ordinary writes instead of silently erasing it. A confirmed valid backup restore can replace unreadable data.

All transactions use one selected currency (EUR, USD, GBP, NGN, CAD, or AUD). Changing currency changes its display label; it does not convert amounts. Amounts accept up to two decimal places and totals are calculated in integer cents. Backups are validated before saving; limits are 10,000 transactions and a 10 MB JSON file.

## Verification

`npm test` checks amount/date validation, exact totals, monthly boundaries, filters, editing, CSV escaping, migration, storage failures, and backup validation. It does not replace browser checks of layout and interaction.
