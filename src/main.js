import './style.css';
import Chart from 'chart.js/auto';
import { format, parseISO } from 'date-fns';
import { icon } from './icons.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, todayISO, currentMonth, createTransaction, updateTransaction, filterTransactions, summarizeMonth, dailySpending, serializeCSV, createDemoTransactions } from './expenses.js';
import { loadState, saveState, parseBackup, exportBackup } from './store.js';

const app = document.querySelector('#app');
const dialogRoot = document.querySelector('#dialog-root');
const toastRoot = document.querySelector('#toast-root');
const initial = loadState();
let state = initial.state;
let warning = initial.warning;
let readOnly = initial.readOnly;
let demo = false;
let realState = null;
let view = 'overview';
let month = currentMonth();
let filters = { search: '', type: 'all', category: 'all', sort: 'newest' };
let page = 1;
let charts = [];
let externalChanges = false;
let toastTimer;
let lastFocused;
const PAGE_SIZE = 8;
const COLORS = ['#32644c', '#b4c899', '#d49b70', '#8aa9a5', '#b4a1bb', '#e1c779', '#92b5cf', '#d6a3a0', '#c0c7bd'];
const CURRENCIES = { EUR: 'Euro', USD: 'US dollar', GBP: 'British pound', NGN: 'Nigerian naira', CAD: 'Canadian dollar', AUD: 'Australian dollar' };
const categoryIcons = { 'Food & drink': 'food', Transport: 'transport', Shopping: 'shopping', 'Bills & utilities': 'bills', Home: 'home', Health: 'health', Entertainment: 'entertainment', Education: 'education', Salary: 'briefcase', Freelance: 'briefcase', Gifts: 'sparkle', Refunds: 'arrowDown' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = (amount, currency = state.currency) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount || 0);
const dateLabel = date => format(parseISO(date), 'dd MMM yyyy');
const monthLabel = (value = month) => format(parseISO(`${value}-01`), 'MMMM yyyy');
const categoryIcon = category => `<span class="category-icon" data-category="${esc(category)}">${icon(categoryIcons[category] || 'other')}</span>`;
const currentBudget = () => state.budgets[month] || { total: 0, categories: {} };
const progress = (used, limit) => limit > 0 ? Math.min(100, Math.max(0, used / limit * 100)) : 0;
const button = (label, action, kind = 'secondary', symbol = '', attrs = '') => `<button class="button button-${kind}" data-action="${action}" ${attrs}>${symbol ? icon(symbol) : ''}<span>${label}</span></button>`;

app.innerHTML = `<div class="app-shell"><aside class="sidebar" id="sidebar" aria-label="Main navigation">
  <a class="brand" href="#overview" aria-label="Penny overview"><span class="brand-icon">${icon('wallet')}</span><span><span class="brand-name">penny<span>.</span></span><span class="brand-caption">A little more clarity.</span></span></a>
  <p class="sidebar-label">YOUR WORKSPACE</p><nav class="nav-list">${[['overview','grid','Overview'],['transactions','transactions','Transactions'],['budgets','budget','Budgets'],['settings','settings','Settings']].map(([key,symbol,label]) => `<button class="nav-item" data-view="${key}">${icon(symbol)}<span>${label}</span></button>`).join('')}</nav>
  <div class="sidebar-budget" id="sidebar-budget"></div><div class="sidebar-footer"><span class="avatar">${icon('wallet')}</span><div><span class="profile-name">Personal workspace</span><span class="profile-caption">Made for your everyday</span></div></div></aside>
  <button class="sidebar-overlay" data-action="close-menu" aria-label="Close navigation" tabindex="-1"></button>
  <main class="workspace"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="menu" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button><span class="breadcrumb">Personal finance <span>/</span> <b id="breadcrumb-view">Overview</b></span></div><div class="topbar-actions"><span class="privacy-badge">${icon('shield')} Saved on this device</span><span class="topbar-avatar" aria-hidden="true">P</span></div></header><div id="content" tabindex="-1"></div></main></div>`;
const content = document.querySelector('#content');

function monthPicker() {
  return `<div class="month-picker"><button class="icon-button" data-action="previous-month" aria-label="Previous month">${icon('chevronLeft')}</button><label class="sr-only" for="selected-month">Selected month</label><input type="month" id="selected-month" min="1900-01" max="9999-12" value="${month}" required><button class="icon-button" data-action="next-month" aria-label="Next month">${icon('chevronRight')}</button></div>`;
}
function banners() {
  return `${demo ? `<div class="demo-banner"><div class="banner-content">${icon('sparkle')}<span><strong>You’re exploring sample data.</strong> Your own records stay separate.</span></div>${button('Exit demo','exit-demo','ghost')}</div>` : ''}${warning && !demo ? `<div class="notice-banner read-only-banner" role="status">${icon('info')}<div><strong>Your saved data needs attention.</strong><p>${esc(warning)} Open Settings to restore a valid backup. Existing storage has been kept.</p></div>${button('Settings','open-settings')}</div>` : ''}`;
}
function pageHeader(title, subtitle, actions = '') {
  return `<div class="page-header"><div class="page-heading"><p class="eyebrow">YOUR MONEY, AT A GLANCE</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="page-actions">${actions}</div></div>`;
}
function render() {
  charts.forEach(chart => chart.destroy()); charts = [];
  document.querySelectorAll('[data-view]').forEach(item => { const active=item.dataset.view===view;item.classList.toggle('active',active);active?item.setAttribute('aria-current','page'):item.removeAttribute('aria-current'); });
  document.querySelector('#breadcrumb-view').textContent=view.charAt(0).toUpperCase()+view.slice(1);
  const summary=summarizeMonth(state.transactions,month), budget=currentBudget();
  document.querySelector('#sidebar-budget').innerHTML=`<div class="sidebar-budget-heading">${icon('budget')}<span>Monthly budget</span></div><div class="sidebar-budget-amount">${budget.total?money(Math.max(0,budget.total-summary.expenses)):'A plan for every penny'}</div>${budget.total?`<div class="progress-track"><span class="progress-fill ${summary.expenses>budget.total?'over-budget':''}" style="width:${progress(summary.expenses,budget.total)}%"></span></div><p class="sidebar-budget-caption">${summary.expenses>budget.total?`${money(summary.expenses-budget.total)} over budget`:`left of ${money(budget.total)}`} · ${format(parseISO(`${month}-01`),'MMM')}</p>`:'<p class="sidebar-budget-caption">Set a spending limit that works for you.</p>'}<button class="sidebar-budget-link" data-view="budgets">Manage budget ${icon('arrowRight')}</button>`;
  if(view==='overview')renderOverview(summary,budget);
  if(view==='transactions')renderTransactions();
  if(view==='budgets')renderBudgets(summary,budget);
  if(view==='settings')renderSettings();
  renderCharts(summary);
}
function renderOverview(summary,budget) {
  const difference=summary.previousExpenses>0?(summary.expenses-summary.previousExpenses)/summary.previousExpenses*100:null;
  const remaining=budget.total>0?budget.total-summary.expenses:null;
  const cards=[['Net balance',summary.balance,'wallet','green','Income minus expenses this month'],['Total income',summary.income,'arrowDown','green','Money coming in this month'],['Total expenses',summary.expenses,'arrowUp','orange',difference===null?'Your spending this month':`${Math.abs(difference).toFixed(1)}% ${difference>0?'more':'less'} than last month`],['Budget remaining',remaining,'budget','blue',remaining===null?'Set a monthly spending target':remaining<0?'Above your monthly spending limit':`${Math.round(progress(summary.expenses,budget.total))}% of your budget used`]];
  const recent=filterTransactions(state.transactions,{month,sort:'newest'}).slice(0,5);
  content.innerHTML=`${banners()}${pageHeader('A clear view of your money.','Small habits. Better decisions. All in one place.',`${monthPicker()}${button('Add transaction','add','primary','plus')}`)}
  <div class="stats-grid">${cards.map(([label,value,symbol,tone,note],index)=>`<article class="stat-card"><div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon" data-tone="${tone}">${icon(symbol)}</span></div><div class="stat-value ${value!==null&&value<0?'negative':''}">${value===null?'Not set':money(value)}</div><p class="stat-foot">${index===2&&difference!==null?`<span class="stat-change ${difference<=0?'positive':'negative'}">${icon(difference>0?'arrowUp':'arrowDown')}</span>`:''}${value===null?'<button class="text-button" data-action="edit-budget">Set your budget '+icon('arrowRight')+'</button>':esc(note)}</p></article>`).join('')}</div>
  ${state.transactions.length===0?`<div class="empty-onboarding"><div class="empty-onboarding-icon">${icon('sparkle')}</div><div><h2>A fresh start for your finances</h2><p>Add your first transaction, or take a look around with sample data.</p></div><div class="onboarding-actions">${button('Explore sample data','demo','secondary','grid')}${button('Add your first entry','add','primary','plus')}</div></div>`:''}
  <div class="dashboard-grid"><section class="panel"><div class="panel-header"><div class="panel-heading"><h2>Spending over time</h2><p>Your daily expenses in ${monthLabel()}.</p></div><span class="chart-key"><i></i> Expenses</span></div><div class="chart-summary"><b>${money(summary.expenses)}</b><span>spent this month</span></div><div class="spending-chart"><canvas id="spending-chart" role="img" aria-label="Daily expenses. Total: ${esc(money(summary.expenses))}. Transaction details are available below."></canvas>${summary.expenses===0?'<div class="chart-empty"><span>No expenses this month</span><small>Your spending story will appear here.</small></div>':''}</div></section>
  <section class="panel category-panel"><div class="panel-header"><div class="panel-heading"><h2>Where it goes</h2><p>A breakdown by category.</p></div><span class="panel-header-icon">${icon('budget')}</span></div>${categoryBreakdown(summary)}</section></div>
  <section class="panel transactions-panel"><div class="panel-header"><div class="panel-heading"><h2>Recent transactions</h2><p>Your latest money moves this month.</p></div><button class="panel-action" data-view="transactions">View all ${icon('arrowRight')}</button></div>${transactionTable(recent,true)}</section>
  <div class="insight-note">${icon('shield')}<p>Your finances stay yours. Everything is saved in this browser, on this device. <button class="text-button" data-action="backup">Download a backup</button></p></div>`;
}
function categoryBreakdown(summary) {
  const groups=Object.entries(summary.byCategory).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
  if(!groups.length)return `<div class="empty-state category-empty"><div class="empty-donut">${icon('budget')}</div><h3>Make room for the full picture</h3><p>Add an expense to see where your money goes.</p></div>`;
  return `<div class="category-chart"><canvas id="category-chart" role="img" aria-label="Spending by category. Amounts and percentages are listed below."></canvas><div class="donut-center"><b>${groups.length}</b><span>categories</span></div></div><div class="category-legend">${groups.map(([category,amount],i)=>`<div class="legend-row"><span class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></span><span class="legend-name">${esc(category)}</span><span class="legend-amount">${money(amount)}</span><span class="legend-percent">${Math.round(amount/summary.expenses*100)}%</span></div>`).join('')}</div>`;
}
function transactionTable(rows,compact=false) {
  if(!rows.length)return `<div class="empty-state"><span class="empty-icon">${icon('transactions')}</span><h3>${!compact&&(filters.search||filters.type!=='all'||filters.category!=='all')?'No matching transactions':'Nothing here just yet'}</h3><p>${compact?'Add an income or expense to start tracking this month.':'Try another month or filter, or add a new transaction.'}</p>${button('Add transaction','add','secondary','plus')}</div>`;
  return `<div class="table-wrap"><table class="transaction-table"><caption class="sr-only">${compact?'Recent':'Filtered'} transactions for ${monthLabel()}</caption><thead><tr><th scope="col">Transaction</th><th scope="col">Category</th><th scope="col">Date</th><th scope="col" class="amount-heading">Amount</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(row=>`<tr><td data-label="Transaction"><div class="transaction-info">${categoryIcon(row.category)}<div><span class="transaction-name">${esc(row.description)}</span><span class="transaction-note">${esc(row.note||(row.type==='income'?'Income':'Expense'))}</span></div></div></td><td data-label="Category"><span class="category-badge">${esc(row.category)}</span></td><td data-label="Date" class="date-cell">${dateLabel(row.date)}</td><td data-label="Amount" class="amount-cell ${row.type==='income'?'income':''}"><span class="sr-only">${row.type==='income'?'Income':'Expense'}: </span>${row.type==='income'?'+':'−'}${money(row.amount)}</td><td data-label="Actions"><div class="row-actions"><button class="icon-button" data-action="edit" data-id="${esc(row.id)}" aria-label="Edit ${esc(row.description)}">${icon('edit')}</button><button class="icon-button delete-button" data-action="delete" data-id="${esc(row.id)}" aria-label="Delete ${esc(row.description)}">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
function filtered(){return filterTransactions(state.transactions,{...filters,month});}
function transactionFooter(rows,pages) {
  const cents=rows.filter(row=>row.type==='expense').reduce((sum,row)=>sum+Math.round(row.amount*100),0);
  return `<div class="table-footer"><span>${rows.length?`${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,rows.length)} of ${rows.length}`:'0 transactions'} <span class="footer-spending">· ${money(cents/100)} in expenses</span></span><div class="pagination"><button class="icon-button" data-action="previous-page" aria-label="Previous page" ${page===1?'disabled':''}>${icon('chevronLeft')}</button><span>Page ${page} of ${pages}</span><button class="icon-button" data-action="next-page" aria-label="Next page" ${page===pages?'disabled':''}>${icon('chevronRight')}</button></div></div>`;
}
function renderTransactions() {
  const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.min(page,pages);
  content.innerHTML=`${banners()}${pageHeader('Every little transaction.','Track, find, and fine-tune your income and expenses.',`${monthPicker()}${button('Add transaction','add','primary','plus')}`)}
  <section class="panel transactions-panel"><div class="panel-header"><div class="panel-heading"><h2>Transactions <span class="transaction-count">${rows.length}</span></h2><p>All your entries for ${monthLabel()}.</p></div>${button('Export CSV','csv','secondary','download',rows.length?'':'disabled')}</div>
  <div class="filter-bar"><label class="search-field">${icon('search')}<span class="sr-only">Search transactions</span><input id="search-filter" type="search" value="${esc(filters.search)}" placeholder="Search transactions…" autocomplete="off"></label><label class="sr-only" for="type-filter">Transaction type</label><select id="type-filter">${[['all','All types'],['expense','Expenses'],['income','Income']].map(([value,label])=>`<option value="${value}" ${filters.type===value?'selected':''}>${label}</option>`).join('')}</select><label class="sr-only" for="category-filter">Category</label><select id="category-filter"><option value="all">All categories</option>${[...EXPENSE_CATEGORIES,...INCOME_CATEGORIES].map(category=>`<option ${filters.category===category?'selected':''}>${esc(category)}</option>`).join('')}</select><label class="sr-only" for="sort-filter">Sort transactions</label><select id="sort-filter">${[['newest','Newest first'],['oldest','Oldest first'],['highest','Highest amount'],['lowest','Lowest amount']].map(([value,label])=>`<option value="${value}" ${filters.sort===value?'selected':''}>${label}</option>`).join('')}</select></div><div id="transactions-results">${transactionTable(rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE))}${transactionFooter(rows,pages)}</div></section>`;
}
function renderBudgets(summary,budget) {
  const remaining=budget.total-summary.expenses;
  content.innerHTML=`${banners()}${pageHeader('Give your money a plan.','Set monthly limits and leave room for what matters.',`${monthPicker()}${button('Edit monthly budget','edit-budget','primary','edit')}`)}
  <section class="panel budget-summary"><div class="panel-header"><div class="panel-heading"><h2>Your monthly budget</h2><p>${monthLabel()}</p></div><span class="budget-status ${budget.total&&remaining<0?'over-budget':''}">${budget.total?remaining<0?'Over budget':'Within budget':'Not set'}</span></div><div class="budget-figures"><div><span>Spent so far</span><strong>${money(summary.expenses)}</strong></div><div><span>Monthly limit</span><strong>${budget.total?money(budget.total):'—'}</strong></div><div><span>${remaining<0&&budget.total?'Over budget':'Remaining'}</span><strong class="${remaining<0&&budget.total?'negative':'positive'}">${budget.total?money(Math.abs(remaining)):'—'}</strong></div></div><div class="progress-track"><span class="progress-fill ${remaining<0?'over-budget':''}" style="width:${progress(summary.expenses,budget.total)}%"></span></div><p class="budget-caption">${budget.total?`${Math.round(summary.expenses/budget.total*100)}% of your monthly limit used. Category limits are optional and independent of this total.`:'Choose a monthly limit to see how your spending measures up.'}</p></section>
  <div class="section-heading"><div><h2>A little structure, by category</h2><p>Set limits for the things you spend on most.</p></div><span class="text-muted">${EXPENSE_CATEGORIES.length} categories</span></div><div class="budget-grid">${EXPENSE_CATEGORIES.map(category=>{const limit=budget.categories[category]||0,spent=summary.byCategory[category]||0;return `<article class="budget-card"><div class="budget-card-top">${categoryIcon(category)}<h3>${esc(category)}</h3><button class="icon-button" data-action="category-budget" data-category="${esc(category)}" aria-label="Edit ${esc(category)} budget">${icon('edit')}</button></div><div class="budget-card-amount"><strong>${money(spent)}</strong><small>${limit?` / ${money(limit)}`:' spent'}</small></div><div class="progress-track"><span class="progress-fill ${limit&&spent>limit?'over-budget':''}" style="width:${progress(spent,limit)}%"></span></div><div class="budget-card-foot"><span class="${limit&&spent>limit?'negative':''}">${limit?spent>limit?`${money(spent-limit)} over budget`:`${money(limit-spent)} left`:'No limit set'}</span>${limit?`<span>${Math.round(spent/limit*100)}%</span>`:`<button class="text-button" data-action="category-budget" data-category="${esc(category)}">Set limit ${icon('plus')}</button>`}</div></article>`;}).join('')}</div>`;
}
function renderSettings() {
  content.innerHTML=`${banners()}${pageHeader('Make yourself at home.','Your preferences, your records, your peace of mind.')}<div class="settings-grid">
  <section class="settings-card"><span class="settings-icon">${icon('wallet')}</span><h2>Display currency</h2><p>Choose the currency you use for your records.</p><label class="field-label" for="currency-select">Currency</label><select id="currency-select" ${readOnly&&!demo?'disabled':''}>${Object.entries(CURRENCIES).map(([code,name])=>`<option value="${code}" ${state.currency===code?'selected':''}>${code} — ${name}</option>`).join('')}</select><p class="field-help">Changing currency relabels existing amounts. It does not convert exchange rates. Track one currency at a time.</p></section>
  <section class="settings-card"><span class="settings-icon">${icon('download')}</span><h2>Keep a copy</h2><p>Download a complete backup of your transactions, budgets, and preferences.</p>${button('Download backup','backup','secondary','download',readOnly&&!demo?'disabled':'')}<p class="field-help">JSON format · ${state.transactions.length} transactions. Save a backup regularly, especially before clearing browser data.</p></section>
  <section class="settings-card"><span class="settings-icon">${icon('upload')}</span><h2>Bring your records back</h2><p>Restore a Penny JSON backup. Review it before merging or replacing records.</p><input type="file" id="backup-input" accept=".json,application/json" class="sr-only">${button('Choose a backup','choose-import','secondary','upload',demo?'disabled':'')}<p class="field-help">${demo?'Exit demo mode to import your own data.':'Only valid backups are accepted. Nothing changes until you confirm.'}</p></section>
  <section class="settings-card"><span class="settings-icon">${icon('shield')}</span><h2>Private by design</h2><p>Your records are stored locally in this browser. There is no account, bank connection, or cloud sync.</p><div class="storage-note">${icon('check')}<span>Transactions: ${state.transactions.length}<br>Storage: ${demo?'Temporary sample workspace':readOnly?'Needs attention':'This browser and device'}</span></div><p class="field-help">Another browser, device, or website address has its own storage. Clearing site data removes local records.</p></section></div>
  <div class="demo-settings"><div><h2>Take a look around</h2><p>Try the features with a sample month. Your saved records stay separate.</p></div>${button(demo?'Exit sample workspace':'Explore sample data',demo?'exit-demo':'demo','secondary','sparkle')}</div>`;
}
function renderCharts(summary) {
  if(view!=='overview')return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Chart.defaults.font.family='Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';Chart.defaults.color='#819086';
  const daily=dailySpending(state.transactions,month);
  charts.push(new Chart(document.querySelector('#spending-chart'),{type:'bar',data:{labels:daily.labels,datasets:[{data:daily.values,backgroundColor:'#7b9e7c',hoverBackgroundColor:'#295b41',borderRadius:4,maxBarThickness:17}]},options:{responsive:true,maintainAspectRatio:false,animation:reduced?false:{duration:350},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>`${monthLabel()} · day ${items[0].label}`,label:item=>` Expenses: ${money(item.raw)}`},backgroundColor:'#183e2f',padding:12,displayColors:false}},scales:{x:{grid:{display:false},border:{display:false},ticks:{maxTicksLimit:8,maxRotation:0,font:{size:11}}},y:{beginAtZero:true,suggestedMax:summary.expenses?undefined:100,border:{display:false},grid:{color:'#edf0eb'},ticks:{maxTicksLimit:5,font:{size:11},callback:value=>new Intl.NumberFormat('en',{style:'currency',currency:state.currency,notation:'compact',maximumFractionDigits:0}).format(value)}}}}}));
  const canvas=document.querySelector('#category-chart');
  if(canvas){const groups=Object.entries(summary.byCategory).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);charts.push(new Chart(canvas,{type:'doughnut',data:{labels:groups.map(([label])=>label),datasets:[{data:groups.map(([,value])=>value),backgroundColor:COLORS,borderColor:'#fff',borderWidth:4,borderRadius:5,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'77%',animation:reduced?false:{duration:350},plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>` ${item.label}: ${money(item.raw)}`},backgroundColor:'#183e2f',padding:12}}}}));}
}
function showToast(message,{error=false,action,actionLabel='Undo'}={}) {
  clearTimeout(toastTimer);toastRoot.innerHTML=`<div class="toast ${error?'error':''}" role="${error?'alert':'status'}"><span class="toast-icon">${icon(error?'info':'check')}</span><span class="toast-message">${esc(message)}</span>${action?`<button id="toast-action">${esc(actionLabel)}</button>`:''}<button class="toast-close" aria-label="Dismiss notification">${icon('close')}</button></div>`;
  toastRoot.querySelector('.toast-close').addEventListener('click',()=>{toastRoot.innerHTML='';});
  if(action)toastRoot.querySelector('#toast-action').addEventListener('click',()=>{toastRoot.innerHTML='';action();});
  toastTimer=setTimeout(()=>{toastRoot.innerHTML='';},action?20000:error?14000:5000);
}
function commit(next,message,{recovery=false}={}) {
  if(externalChanges&&!demo){showToast('Another tab changed your records. Close this dialog and try again.',{error:true});return false;}
  if(readOnly&&!demo&&!recovery){showToast('Storage needs attention. Restore a valid backup from Settings first.',{error:true});return false;}
  try{if(!demo)saveState(next,undefined,{replaceCorrupt:recovery});state=next;if(recovery){warning=null;readOnly=false;}render();if(message)showToast(message);return true;}
  catch(error){showToast(`Could not save. ${error.message}`,{error:true});return false;}
}
function openModal(title,subtitle,body,onSubmit) {
  if(dialogRoot.querySelector('dialog[open]'))closeModal();lastFocused=document.activeElement;
  dialogRoot.innerHTML=`<dialog class="modal" aria-labelledby="dialog-title" aria-describedby="dialog-description"><div class="modal-header"><div><h2 id="dialog-title">${title}</h2><p id="dialog-description">${subtitle}</p></div><button class="icon-button" data-close-dialog aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div></dialog>`;
  const dialog=dialogRoot.querySelector('dialog');dialog.querySelectorAll('[data-close-dialog]').forEach(item=>item.addEventListener('click',closeModal));
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeModal();});if(onSubmit)dialog.querySelector('form').addEventListener('submit',onSubmit);dialog.showModal();
}
function closeModal() {
  dialogRoot.querySelector('dialog')?.close();dialogRoot.replaceChildren();
  if(externalChanges&&!demo){const loaded=loadState();state=loaded.state;warning=loaded.warning;readOnly=loaded.readOnly;externalChanges=false;render();}
  if(lastFocused?.isConnected)lastFocused.focus();
}
function formError(error){const field=dialogRoot.querySelector('.form-error');if(field){field.textContent=error.message||error;field.hidden=false;field.focus();}}
function transactionModal(id) {
  if(readOnly&&!demo){showToast('Restore a valid backup in Settings before adding records.',{error:true});return;}
  const entry=id?state.transactions.find(row=>row.id===id):null;if(id&&!entry)return;
  const type=entry?.type||'expense',defaultDate=month===currentMonth()?todayISO():`${month}-01`;
  openModal(entry?'Edit transaction':'Add a transaction','A small entry. A clearer picture.',`<form id="transaction-form"><div class="type-switch" role="group" aria-label="Transaction type">${['expense','income'].map(value=>`<button type="button" data-transaction-type="${value}" class="${type===value?'active':''}" aria-pressed="${type===value}">${icon(value==='expense'?'arrowUp':'arrowDown')}${value==='expense'?'Expense':'Income'}</button>`).join('')}</div><input name="type" type="hidden" value="${type}"><div class="form-grid"><div class="field full-width"><label for="entry-description">Description</label><input id="entry-description" name="description" placeholder="e.g. Weekly groceries" value="${esc(entry?.description||'')}" maxlength="120" required autofocus></div><div class="field"><label for="entry-amount">Amount (${state.currency})</label><input id="entry-amount" name="amount" type="number" inputmode="decimal" min="0.01" max="999999999.99" step="0.01" placeholder="0.00" value="${entry?.amount||''}" required></div><div class="field"><label for="entry-date">Date</label><input id="entry-date" name="date" type="date" min="1900-01-01" max="9999-12-31" value="${entry?.date||defaultDate}" required></div><div class="field full-width"><label for="entry-category">Category</label><select id="entry-category" name="category">${(type==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES).map(category=>`<option ${entry?.category===category?'selected':''}>${esc(category)}</option>`).join('')}</select></div><div class="field full-width"><label for="entry-note">Note <span class="text-muted">(optional)</span></label><textarea id="entry-note" name="note" placeholder="Anything you’d like to remember" maxlength="500" rows="3">${esc(entry?.note||'')}</textarea></div></div><p class="form-error" tabindex="-1" role="alert" hidden></p><div class="modal-footer"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">${entry?'Save changes':'Add transaction'}${icon('arrowRight')}</button></div></form>`,event=>{
    event.preventDefault();try{const values=Object.fromEntries(new FormData(event.currentTarget));const transactions=entry?updateTransaction(state.transactions,id,values):[...state.transactions,createTransaction(values)];if(commit({...state,transactions},entry?'Transaction updated.':'Transaction added.'))closeModal();}catch(error){formError(error);}
  });
  dialogRoot.querySelectorAll('[data-transaction-type]').forEach(item=>item.addEventListener('click',()=>{const selected=item.dataset.transactionType;dialogRoot.querySelector('[name=type]').value=selected;dialogRoot.querySelectorAll('[data-transaction-type]').forEach(button=>{const active=button===item;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});dialogRoot.querySelector('[name=category]').innerHTML=(selected==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES).map(category=>`<option>${esc(category)}</option>`).join('');}));
}
function budgetModal(category) {
  const budget=currentBudget(),value=category?budget.categories[category]||0:budget.total;
  openModal(category?`${esc(category)} budget`:'Your monthly budget',`A spending limit for ${monthLabel()}.`,`<form><div class="field"><label for="budget-amount">Monthly limit (${state.currency})</label><input id="budget-amount" name="amount" type="number" min="0" max="999999999.99" step="0.01" inputmode="decimal" value="${value||''}" placeholder="0.00" required autofocus><p class="field-help">Enter 0 to remove this limit. ${category?'Category limits do not change the overall monthly limit.':'This is the total spending limit across all expense categories.'}</p></div><p class="form-error" tabindex="-1" role="alert" hidden></p><div class="modal-footer"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Save budget ${icon('check')}</button></div></form>`,event=>{
    event.preventDefault();const amount=Number(new FormData(event.currentTarget).get('amount'));if(!Number.isFinite(amount)||amount<0||amount>999999999.99){formError('Enter a valid non-negative budget.');return;}
    const updated={...budget,categories:{...budget.categories}};if(category)updated.categories[category]=Math.round(amount*100)/100;else updated.total=Math.round(amount*100)/100;
    if(commit({...state,budgets:{...state.budgets,[month]:updated}},'Budget updated.'))closeModal();
  });
}
function deleteModal(id) {
  const entry=state.transactions.find(row=>row.id===id);if(!entry)return;
  openModal('Delete this transaction?','You can undo this immediately after deleting.',`<form><div class="confirm-body"><div class="transaction-info">${categoryIcon(entry.category)}<div><strong>${esc(entry.description)}</strong><p>${dateLabel(entry.date)} · ${money(entry.amount)}</p></div></div></div><div class="modal-footer"><button class="button button-secondary" type="button" data-close-dialog>Keep transaction</button><button class="button button-danger" type="submit">Delete transaction</button></div></form>`,event=>{
    event.preventDefault();if(commit({...state,transactions:state.transactions.filter(row=>row.id!==id)})){const fromDemo=demo;closeModal();showToast('Transaction deleted.',{action:()=>{if(demo!==fromDemo){showToast('Return to the same workspace to undo this deletion.',{error:true});return;}if(!state.transactions.some(row=>row.id===id))commit({...state,transactions:[...state.transactions,entry]},'Transaction restored.');}});}
  });
}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function showImport(candidate) {
  const allowMerge=candidate.currency===state.currency&&!readOnly;
  openModal('Review your backup','Choose how these records should be restored.',`<form><div class="import-summary"><strong>${candidate.transactions.length} transactions</strong><span>${esc(candidate.currency)} · ${Object.keys(candidate.budgets).length} monthly budgets</span></div><div class="import-options"><label class="radio-option"><input type="radio" name="mode" value="merge" ${allowMerge?'checked':'disabled'}><span><strong>Merge transactions</strong><small>Add new records. Existing IDs, budgets, and preferences are kept.${candidate.currency!==state.currency?' Currency must match to merge.':''}</small></span></label><label class="radio-option"><input type="radio" name="mode" value="replace" ${allowMerge?'':'checked'}><span><strong>Replace all data</strong><small>Replace ${state.transactions.length} current transactions, budgets, and currency with this backup.</small></span></label></div><p class="dialog-note">Download a backup of your current data before replacing it.</p><p class="form-error" tabindex="-1" role="alert" hidden></p><div class="modal-footer"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Restore backup ${icon('upload')}</button></div></form>`,event=>{
    event.preventDefault();const mode=new FormData(event.currentTarget).get('mode');let next=candidate;
    if(mode==='merge'){if(!allowMerge){formError('These currencies cannot be merged.');return;}const ids=new Set(state.transactions.map(row=>row.id));next={...state,transactions:[...state.transactions,...candidate.transactions.filter(row=>!ids.has(row.id))]};}
    if(commit(next,'Backup restored.',{recovery:readOnly&&mode==='replace'}))closeModal();
  });
}
function startDemo(){if(demo)return;realState=state;demo=true;state={version:2,currency:state.currency,transactions:createDemoTransactions(month),budgets:{[month]:{total:2200,categories:{'Food & drink':400,Transport:180,Shopping:250,'Bills & utilities':300,Home:900,Entertainment:160}}}};view='overview';page=1;render();showToast('Sample workspace opened. Your own data is safe.');}
function exitDemo(){if(!demo)return;state=realState;demo=false;realState=null;filters={search:'',type:'all',category:'all',sort:'newest'};page=1;render();showToast('Back to your own workspace.');}
function closeMenu(){app.querySelector('.app-shell').classList.remove('menu-open');app.querySelector('[data-action=menu]').setAttribute('aria-expanded','false');}

app.addEventListener('click',event=>{
  const nav=event.target.closest('[data-view]');if(nav){view=nav.dataset.view;page=1;closeMenu();render();return;}
  const target=event.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;
  if(action==='menu'){const open=app.querySelector('.app-shell').classList.toggle('menu-open');target.setAttribute('aria-expanded',open);}
  if(action==='close-menu')closeMenu();if(action==='add')transactionModal();if(action==='edit')transactionModal(target.dataset.id);if(action==='delete')deleteModal(target.dataset.id);if(action==='edit-budget')budgetModal();if(action==='category-budget')budgetModal(target.dataset.category);
  if(action==='previous-month'||action==='next-month'){const[y,m]=month.split('-').map(Number);const next=new Date(y,m-1+(action==='next-month'?1:-1),1),year=next.getFullYear();if(year>=1900&&year<=9999){month=`${year}-${String(next.getMonth()+1).padStart(2,'0')}`;page=1;render();}}
  if(action==='previous-page'){page--;render();}if(action==='next-page'){page++;render();}
  if(action==='csv'){download(`penny-transactions-${month}.csv`,serializeCSV(filtered(),state.currency),'text/csv;charset=utf-8');showToast('Filtered transactions exported.');}
  if(action==='backup'){if(readOnly&&!demo){showToast('Restore valid data before exporting a new backup.',{error:true});return;}download(`penny-backup-${todayISO()}${demo?'-sample':''}.json`,exportBackup(state),'application/json');showToast('Backup downloaded.');}
  if(action==='choose-import')document.querySelector('#backup-input')?.click();if(action==='demo')startDemo();if(action==='exit-demo')exitDemo();if(action==='open-settings'){view='settings';render();}
});
app.addEventListener('input',event=>{if(event.target.id==='search-filter'){filters.search=event.target.value;page=1;const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));document.querySelector('#transactions-results').innerHTML=transactionTable(rows.slice(0,PAGE_SIZE))+transactionFooter(rows,pages);document.querySelector('.transaction-count').textContent=rows.length;document.querySelector('[data-action=csv]').disabled=rows.length===0;}});
app.addEventListener('change',async event=>{
  const target=event.target;
  if(target.id==='selected-month'){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(target.value)&&target.validity.valid){month=target.value;page=1;render();}else target.value=month;}
  for(const key of ['type','category','sort'])if(target.id===`${key}-filter`){filters[key]=target.value;page=1;render();}
  if(target.id==='currency-select'){const currency=target.value;if(currency===state.currency)return;target.value=state.currency;openModal('Change display currency?','Existing amounts will stay exactly the same.',`<form><p class="confirm-body">All records will be labelled <strong>${esc(currency)}</strong> instead of <strong>${state.currency}</strong>. This does not perform an exchange-rate conversion.</p><div class="modal-footer"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Use ${esc(currency)}</button></div></form>`,event=>{event.preventDefault();if(commit({...state,currency},'Display currency updated.'))closeModal();});}
  if(target.id==='backup-input'){const file=target.files[0];target.value='';if(!file)return;if(file.size>5*1024*1024){showToast('Choose a JSON backup smaller than 5 MB.',{error:true});return;}try{showImport(parseBackup(await file.text()));}catch(error){showToast(`Backup not imported. ${error.message}`,{error:true});}}
});
window.addEventListener('storage',event=>{if(event.key&&!event.key.startsWith('expense-tracker')&&!event.key.startsWith('penny'))return;const loaded=loadState();if(demo){realState=loaded.state;warning=loaded.warning;readOnly=loaded.readOnly;return;}if(dialogRoot.querySelector('dialog[open]')){externalChanges=true;showToast('Records changed in another tab. Close this dialog to load the latest data.',{error:true});return;}state=loaded.state;warning=loaded.warning;readOnly=loaded.readOnly;render();showToast('Updated with changes from another tab.');});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
app.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();view='overview';closeMenu();render();});
render();
