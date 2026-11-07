# Expense Tracker

A personal expense tracking application built with JavaScript, npm, and Vite.

## Features

- Add, categorize, and delete expenses
- Calculate total spending
- Visualize expenses using Chart.js
- Store expenses locally in the browser
- Format dates using date-fns

## Technologies

- JavaScript
- Node.js and npm
- Vite
- Chart.js
- date-fns

## Prerequisites

Node.js 22.12.0 or a newer compatible version and npm.

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/thenaijadev/expense_tracker.git
cd expense_tracker
npm ci
```

## Build, Test, and Run

Start the application locally:

```bash
npm run dev
```

Run automated tests:

```bash
npm test
```

Generate the production build:

```bash
npm run build
```

The production files are generated in the `dist/` directory.

Preview the production build:

```bash
npm run preview
```

## Build Automation

The project uses **npm** and **Vite** to automate:

- **Dependency management:** npm installs external libraries declared in `package.json`.
- **Compilation/build processing:** Vite transforms and bundles JavaScript and CSS.
- **Version management:** The project version is managed in `package.json`.
- **Packaging:** Vite generates an optimized, deployable website in `dist/`.

## Build Configuration

- `package.json`: Project metadata, version, dependencies, and build scripts.
- `package-lock.json`: Exact resolved dependency versions.
- `vite.config.js`: Production build configuration.

## Reproducibility

The project uses a committed `package-lock.json` to support reproducible dependency installation.

The build was verified from a fresh GitHub clone using:

```bash
npm ci
npm test
npm run build
```

All 3 tests passed, and the production build completed successfully.

## Version

**1.0.1**

## Repository

https://github.com/thenaijadev/expense_tracker