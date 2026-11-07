# Expense Tracker

A personal expense tracking application built with JavaScript, npm, and Vite.

## Features

- Add and delete expenses
- Categorize expenses
- Calculate total spending
- Visualize spending by category with Chart.js
- Save expenses locally in the browser
- Format transaction dates with date-fns

## Technology

- JavaScript (ES modules)
- Node.js and npm
- Vite for development and production bundling
- Chart.js for visualization
- date-fns for date formatting

## Prerequisites

Install Node.js 22.12.0 or a newer compatible version, together with npm.

## Installation

Clone this repository and enter its directory:

```bash
git clone https://github.com/thenaijadev/expense_tracker.git
cd expense-tracker
```

Install the exact locked dependencies:

```bash
npm ci
```

## Development

Start the development server:

```bash
npm run dev
```

Open the local URL shown in the terminal.

## Build and Packaging

Generate an optimized production bundle:

```bash
npm run build
```

The generated files are located in `dist/`. This directory contains the production website, including its bundled JavaScript and CSS assets.

Preview the production build:

```bash
npm run preview
```

## Testing

Run the automated tests:

```bash
npm test
```

## Version Management

The project version is declared in `package.json`.

To inspect the current version:

```bash
npm pkg get version
```

To increment the patch version:

```bash
npm version patch
```

## Build Configuration

- `package.json`: project metadata, scripts, and dependency declarations.
- `package-lock.json`: resolved dependency versions and integrity information.
- `vite.config.js`: Vite build configuration.
- `src/`: application source code.
- `tests/`: automated tests.

## Reproducibility

The project uses a committed lockfile so that dependencies can be restored using `npm ci`. Generated directories such as `node_modules/` and `dist/` are not committed.

## Application Data

Expenses are stored in the browser's local storage. No external database or server is required to run the application.

## Version

1.0.0 — Initial release.# expense_tracker
