/* ============================================================
   StudentSpend — Frontend Application
   ============================================================ */

(function () {
  'use strict';

  // ---------- State ----------
  let supabase = null;
  let currentUser = null;
  let profile = null;
  let transactions = [];
  let budgets = [];
  let charts = { category: null, monthly: null, comparison: null };
  let deleteTargetId = null;
  let config = { supabaseUrl: '', supabaseAnonKey: '', aiEnabled: false };

  const CATEGORY_ICONS = {
    Food: '🍔',
    Transport: '🚌',
    Education: '📚',
    Shopping: '🛍️',
    Entertainment: '🎬',
    Sports: '⚽',
    'Mobile / Internet': '📱',
    Subscriptions: '🔄',
    Stationery: '✏️',
    Other: '📦',
    'Pocket Money': '💰',
    Gift: '🎁',
    Freelancing: '💻',
    'Part-time Work': '💼',
    Scholarship: '🎓'
  };

  const EXPENSE_CATEGORIES = [
    'Food', 'Transport', 'Education', 'Shopping', 'Entertainment',
    'Sports', 'Mobile / Internet', 'Subscriptions', 'Stationery', 'Other'
  ];

  // ---------- Utils ----------
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function formatPKR(n) {
    const num = Number(n) || 0;
    return '₨ ' + num.toLocaleString('en-PK', { maximumFractionDigits: 0 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = (x) => x.toISOString().slice(0, 10);
    if (dateStr === iso(today)) return 'Today';
    if (dateStr === iso(yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
  }

  function currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthLabel(key) {
    if (!key) return '';
    const [y, m] = key.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function animateNumber(el, target, duration = 800) {
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    const isCurrency = el.textContent.includes('₨') || true;
    function tick(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(start + (target - start) * eased);
      el.textContent = formatPKR(val);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function toast(message, type = 'info') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = '0.3s';
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  function showLoading(show) {
    $('#loading-overlay').classList.toggle('hidden', !show);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---------- Supabase init ----------
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      config = await res.json();
    } catch (e) {
      console.error('Config load failed', e);
    }
  }

  function initSupabase() {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      console.warn('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
      return null;
    }
    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  // ---------- Auth ----------
  async function checkSession() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  async function handleSignup(e) {
    e.preventDefault();
    const name = $('#signup-name').value.trim();
    const email = $('#signup-email').value.trim();
    const password = $('#signup-password').value;
    const errEl = $('#signup-error');
    errEl.classList.add('hidden');

    if (!name || !email || password.length < 6) {
      errEl.textContent = 'Please fill all fields. Password must be at least 6 characters.';
      errEl.classList.remove('hidden');
      return;
    }

    showLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      if (data.user) {
        toast('Account created! Check your email if confirmation is required.', 'success');
        closeAuth();
        // Profile is created by trigger; wait a moment then refresh
        await new Promise(r => setTimeout(r, 500));
        await onAuthSuccess(data.session || (await checkSession()));
      }
    } catch (err) {
      errEl.textContent = err.message || 'Signup failed';
      errEl.classList.remove('hidden');
    } finally {
      showLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const errEl = $('#login-error');
    errEl.classList.add('hidden');

    showLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuth();
      await onAuthSuccess(data.session);
      toast('Welcome back!', 'success');
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
      errEl.classList.remove('hidden');
    } finally {
      showLoading(false);
    }
  }

  async function logout() {
    showLoading(true);
    try {
      if (supabase) await supabase.auth.signOut();
    } finally {
      currentUser = null;
      profile = null;
      transactions = [];
      budgets = [];
      showLanding();
      showLoading(false);
      toast('Logged out', 'info');
    }
  }

  async function onAuthSuccess(session) {
    if (!session) {
      showLanding();
      return;
    }
    currentUser = session.user;
    await loadProfile();
    await loadAllData();
    showApp();
    renderDashboard();
  }

  async function loadProfile() {
    if (!supabase || !currentUser) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();
    if (!error && data) {
      profile = data;
    } else {
      profile = {
        id: currentUser.id,
        full_name: currentUser.user_metadata?.full_name || 'Student',
        currency: 'PKR'
      };
    }
  }

  // ---------- Data ----------
  async function loadAllData() {
    if (!supabase || !currentUser) return;
    const [txRes, budgetRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('budgets')
        .select('*')
        .eq('user_id', currentUser.id)
    ]);
    transactions = txRes.data || [];
    budgets = budgetRes.data || [];
  }

  function getMonthTransactions(monthKey = currentMonthKey()) {
    return transactions.filter(t => (t.transaction_date || '').startsWith(monthKey));
  }

  function calcStats(monthKey = currentMonthKey()) {
    const list = getMonthTransactions(monthKey);
    const income = list.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const spent = list.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - spent;
    const budget = budgets.find(b => b.month === monthKey);
    const budgetAmount = budget ? Number(budget.amount) : 0;
    const remaining = budgetAmount ? budgetAmount - spent : balance;
    return { income, spent, balance, budgetAmount, remaining, budget };
  }

  // ---------- CRUD ----------
  async function saveTransaction(payload) {
    if (!supabase || !currentUser) throw new Error('Not authenticated');
    const row = {
      user_id: currentUser.id,
      type: payload.type,
      amount: Number(payload.amount),
      category: payload.category,
      description: (payload.description || '').trim(),
      payment_method: payload.payment_method || 'Cash',
      transaction_date: payload.transaction_date
    };
    if (Number(row.amount) <= 0) throw new Error('Amount must be greater than 0');

    if (payload.id) {
      const { error } = await supabase
        .from('transactions')
        .update(row)
        .eq('id', payload.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('transactions').insert(row);
      if (error) throw error;
    }
  }

  async function deleteTransaction(id) {
    if (!supabase || !currentUser) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (error) throw error;
  }

  async function saveBudget(amount) {
    if (!supabase || !currentUser) throw new Error('Not authenticated');
    const month = currentMonthKey();
    const existing = budgets.find(b => b.month === month);
    if (existing) {
      const { error } = await supabase
        .from('budgets')
        .update({ amount: Number(amount) })
        .eq('id', existing.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('budgets').insert({
        user_id: currentUser.id,
        month,
        amount: Number(amount)
      });
      if (error) throw error;
    }
  }

  // ---------- Render ----------
  function showLanding() {
    $('#landing').classList.remove('hidden');
    $('#app').classList.add('hidden');
    // Hero counter animation
    const bal = document.querySelector('.preview-balance');
    if (bal) animateNumber(bal, 6750, 1200);
  }

  function showApp() {
    $('#landing').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#greeting').textContent = `${greeting()} 👋`;
    $('#current-month').textContent = monthLabel(currentMonthKey());
    if (profile) {
      $('#settings-name').textContent = profile.full_name || '—';
      $('#settings-email').textContent = currentUser?.email || '—';
    }
  }

  function closeAuth() {
    $('#auth-overlay').classList.add('hidden');
  }

  function openAuth(tab = 'login') {
    $('#auth-overlay').classList.remove('hidden');
    $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $('#login-form').classList.toggle('hidden', tab !== 'login');
    $('#signup-form').classList.toggle('hidden', tab !== 'signup');
    $('#login-error').classList.add('hidden');
    $('#signup-error').classList.add('hidden');
  }

  function navigate(page) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const el = $(`#page-${page}`);
    if (el) el.classList.add('active');
    $$('.nav-item[data-page], .bottom-nav-item[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
    if (page === 'analytics') renderCharts();
    if (page === 'insights') loadInsights();
    if (page === 'transactions') renderTransactionList();
    if (page === 'budget') renderBudget();
  }

  function renderDashboard() {
    const stats = calcStats();
    animateNumber($('#stat-balance'), stats.balance);
    animateNumber($('#stat-income'), stats.income);
    animateNumber($('#stat-spent'), stats.spent);
    animateNumber($('#stat-budget-remaining'), stats.budgetAmount ? stats.remaining : stats.balance);

    // Recent
    const recent = transactions.slice(0, 5);
    const recentEl = $('#recent-list');
    if (!recent.length) {
      recentEl.innerHTML = `
        <div class="empty-state">
          <p>No transactions yet.</p>
          <p class="muted">Start tracking your first expense.</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-expense">+ Add Expense</button>
        </div>`;
    } else {
      recentEl.innerHTML = recent.map(txRowHTML).join('');
    }

    // Overview budget
    const ob = $('#overview-budget');
    if (!stats.budget) {
      ob.innerHTML = `
        <div class="empty-state">
          <p>No budget set.</p>
          <button type="button" class="btn btn-secondary btn-sm" data-page="budget">Set Budget</button>
        </div>`;
    } else {
      const pct = stats.budgetAmount ? Math.min(100, Math.round((stats.spent / stats.budgetAmount) * 100)) : 0;
      let level = 'normal';
      if (pct >= 100) level = 'exceeded';
      else if (pct >= 90) level = 'high';
      else if (pct >= 75) level = 'warning';
      ob.innerHTML = `
        <div class="budget-amount-display">${formatPKR(stats.budgetAmount)}</div>
        <div class="budget-progress-wrap">
          <div class="budget-progress"><div class="budget-progress-bar ${level}" style="width:${pct}%"></div></div>
          <div class="budget-meta"><span>${formatPKR(stats.spent)} used</span><span>${pct}%</span></div>
        </div>
        <p class="muted small">${formatPKR(Math.max(0, stats.remaining))} remaining</p>`;
      requestAnimationFrame(() => {
        const bar = ob.querySelector('.budget-progress-bar');
        if (bar) bar.style.width = pct + '%';
      });
    }
  }

  function txRowHTML(t) {
    const icon = CATEGORY_ICONS[t.category] || '📦';
    const sign = t.type === 'income' ? '+' : '-';
    const cls = t.type === 'income' ? 'income' : 'expense';
    return `
      <div class="tx-item" data-id="${t.id}">
        <span class="tx-icon">${icon}</span>
        <div class="tx-meta">
          <strong>${escapeHtml(t.category)}</strong>
          <small>${formatDate(t.transaction_date)} · ${escapeHtml(t.payment_method || 'Cash')}${t.description ? ' · ' + escapeHtml(t.description) : ''}</small>
        </div>
        <span class="tx-amount ${cls}">${sign} ${formatPKR(t.amount)}</span>
        <div class="tx-actions">
          <button type="button" class="icon-btn" data-action="edit-tx" data-id="${t.id}" aria-label="Edit">✎</button>
          <button type="button" class="icon-btn danger" data-action="delete-tx" data-id="${t.id}" aria-label="Delete">✕</button>
        </div>
      </div>`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderTransactionList() {
    const search = ($('#tx-search')?.value || '').toLowerCase();
    const typeF = $('#tx-filter-type')?.value || 'all';
    const catF = $('#tx-filter-category')?.value || 'all';
    const monthF = $('#tx-filter-month')?.value || '';

    // Populate categories
    const catSelect = $('#tx-filter-category');
    if (catSelect && catSelect.options.length <= 1) {
      const cats = [...new Set(transactions.map(t => t.category))].sort();
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
      });
    }

    let list = [...transactions];
    if (typeF !== 'all') list = list.filter(t => t.type === typeF);
    if (catF !== 'all') list = list.filter(t => t.category === catF);
    if (monthF) list = list.filter(t => (t.transaction_date || '').startsWith(monthF));
    if (search) {
      list = list.filter(t =>
        (t.category || '').toLowerCase().includes(search) ||
        (t.description || '').toLowerCase().includes(search) ||
        (t.payment_method || '').toLowerCase().includes(search)
      );
    }

    const el = $('#tx-list');
    if (!list.length) {
      el.innerHTML = `
        <div class="empty-state">
          <p>No transactions match your filters.</p>
          <p class="muted">Try adjusting search or filters, or add a new transaction.</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-expense">+ Add Expense</button>
        </div>`;
    } else {
      el.innerHTML = list.map(txRowHTML).join('');
    }
  }

  function renderBudget() {
    const month = currentMonthKey();
    $('#budget-month-title').textContent = monthLabel(month) + ' Budget';
    const stats = calcStats(month);
    const content = $('#budget-content');

    if (!stats.budget) {
      content.innerHTML = `
        <div class="empty-state">
          <p>No budget set for this month.</p>
          <button type="button" class="btn btn-primary" data-action="edit-budget">Set Monthly Budget</button>
        </div>`;
      return;
    }

    const pct = Math.min(100, Math.round((stats.spent / stats.budgetAmount) * 100));
    let level = 'normal';
    let msg = 'You are within a healthy spending range.';
    if (pct >= 100) {
      level = 'exceeded';
      msg = 'Budget exceeded. Consider pausing non-essential spending.';
    } else if (pct >= 90) {
      level = 'high';
      msg = 'High spending — only a little budget left.';
    } else if (pct >= 75) {
      level = 'warning';
      msg = 'Warning: you have used most of your budget.';
    }

    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayLeft = Math.max(1, daysInMonth - today.getDate() + 1);
    const daily = Math.floor(Math.max(0, stats.remaining) / dayLeft);

    content.innerHTML = `
      <div class="budget-amount-display">${formatPKR(stats.budgetAmount)}</div>
      <div class="budget-progress-wrap">
        <div class="budget-progress"><div class="budget-progress-bar ${level}" id="budget-bar" style="width:0%"></div></div>
        <div class="budget-meta">
          <span>${formatPKR(stats.spent)} used</span>
          <span>${pct}%</span>
        </div>
      </div>
      <p>${formatPKR(Math.max(0, stats.remaining))} remaining</p>
      <div class="budget-warning ${level}">${msg}</div>
      <div class="daily-limit">
        Recommended daily spending: <strong>${formatPKR(daily)}</strong>
        <span class="muted"> · based on ${dayLeft} day${dayLeft !== 1 ? 's' : ''} left</span>
      </div>`;

    requestAnimationFrame(() => {
      const bar = $('#budget-bar');
      if (bar) bar.style.width = pct + '%';
    });
  }

  function renderCharts() {
    const monthKey = currentMonthKey();
    const expenses = getMonthTransactions(monthKey).filter(t => t.type === 'expense');

    // Category doughnut
    const byCat = {};
    expenses.forEach(t => {
      byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount);
    });
    const catLabels = Object.keys(byCat);
    const catData = Object.values(byCat);
    const colors = ['#7c5cff', '#00d4aa', '#ff6b8a', '#ffb020', '#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#94a3b8'];

    if (charts.category) charts.category.destroy();
    const catCtx = $('#chart-category');
    if (catCtx) {
      charts.category = new Chart(catCtx, {
        type: 'doughnut',
        data: {
          labels: catLabels.length ? catLabels : ['No data'],
          datasets: [{
            data: catData.length ? catData : [1],
            backgroundColor: catLabels.length ? colors.slice(0, catLabels.length) : ['#333'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${ctx.label}: ${formatPKR(ctx.raw)} (${pct}%)`;
                }
              }
            }
          },
          animation: { animateRotate: true, duration: 900 }
        }
      });
    }

    const legend = $('#category-legend');
    if (legend) {
      const total = catData.reduce((a, b) => a + b, 0);
      legend.innerHTML = catLabels.map((l, i) => {
        const pct = total ? Math.round((catData[i] / total) * 100) : 0;
        return `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l} ${pct}%</span>`;
      }).join('') || '<span class="muted">No expense data this month</span>';
    }

    // Monthly bar — last 4 months
    const months = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthlySpent = months.map(m =>
      transactions.filter(t => t.type === 'expense' && (t.transaction_date || '').startsWith(m))
        .reduce((s, t) => s + Number(t.amount), 0)
    );
    const monthlyIncome = months.map(m =>
      transactions.filter(t => t.type === 'income' && (t.transaction_date || '').startsWith(m))
        .reduce((s, t) => s + Number(t.amount), 0)
    );
    const monthNames = months.map(m => {
      const [y, mo] = m.split('-');
      return new Date(y, mo - 1).toLocaleDateString('en-PK', { month: 'short' });
    });

    if (charts.monthly) charts.monthly.destroy();
    const monCtx = $('#chart-monthly');
    if (monCtx) {
      charts.monthly = new Chart(monCtx, {
        type: 'bar',
        data: {
          labels: monthNames,
          datasets: [{
            label: 'Spent',
            data: monthlySpent,
            backgroundColor: 'rgba(255, 107, 138, 0.7)',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9898b0' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9898b0' } }
          },
          animation: { duration: 800 }
        }
      });
    }

    // Income vs Expenses
    if (charts.comparison) charts.comparison.destroy();
    const compCtx = $('#chart-comparison');
    if (compCtx) {
      charts.comparison = new Chart(compCtx, {
        type: 'bar',
        data: {
          labels: monthNames,
          datasets: [
            {
              label: 'Income',
              data: monthlyIncome,
              backgroundColor: 'rgba(0, 212, 170, 0.7)',
              borderRadius: 8
            },
            {
              label: 'Expenses',
              data: monthlySpent,
              backgroundColor: 'rgba(255, 107, 138, 0.7)',
              borderRadius: 8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#9898b0', boxWidth: 12 }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9898b0' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9898b0' } }
          },
          animation: { duration: 800 }
        }
      });
    }
  }

  async function loadInsights() {
    const content = $('#insights-content');
    const monthKey = currentMonthKey();
    const list = getMonthTransactions(monthKey);
    if (list.length < 2) {
      content.innerHTML = `
        <div class="empty-state">
          <p>Add a few transactions and we'll generate your first AI spending insight.</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-expense">+ Add Expense</button>
        </div>`;
      return;
    }

    content.innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto 1rem"></div><p>Analyzing your spending…</p></div>`;

    const stats = calcStats(monthKey);
    const byCat = {};
    list.filter(t => t.type === 'expense').forEach(t => {
      byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount);
    });

    // Previous month for comparison
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const prevKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prevSpent = getMonthTransactions(prevKey).filter(t => t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount), 0);

    const summary = {
      month: monthLabel(monthKey),
      income: stats.income,
      spent: stats.spent,
      balance: stats.balance,
      budget: stats.budgetAmount || null,
      budgetRemaining: stats.budgetAmount ? stats.remaining : null,
      categoryBreakdown: byCat,
      previousMonthSpent: prevSpent,
      transactionCount: list.length,
      currency: 'PKR'
    };

    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary })
      });
      const data = await res.json();
      const insights = data.insights || [];
      if (!insights.length) {
        content.innerHTML = `<div class="empty-state"><p>No insights available yet.</p></div>`;
        return;
      }
      content.innerHTML = insights.map(i => `<div class="insight-card">${escapeHtml(i)}</div>`).join('');
    } catch (e) {
      content.innerHTML = `
        <div class="empty-state">
          <p>Could not load AI insights right now.</p>
          <p class="muted">Your data is safe — try again later.</p>
        </div>`;
    }
  }

  // ---------- Forms ----------
  function openExpense(editTx = null) {
    $('#expense-modal').classList.remove('hidden');
    $('#expense-error').classList.add('hidden');
    $('#expense-title').textContent = editTx ? 'Edit Expense' : 'Add Expense';
    if (editTx) {
      $('#expense-id').value = editTx.id;
      $('#expense-amount').value = editTx.amount;
      $('#expense-category').value = editTx.category;
      $('#expense-description').value = editTx.description || '';
      $('#expense-payment').value = editTx.payment_method || 'Cash';
      $('#expense-date').value = editTx.transaction_date;
    } else {
      $('#expense-form').reset();
      $('#expense-id').value = '';
      $('#expense-date').value = new Date().toISOString().slice(0, 10);
    }
  }

  function openIncome(editTx = null) {
    $('#income-modal').classList.remove('hidden');
    $('#income-error').classList.add('hidden');
    $('#income-title').textContent = editTx ? 'Edit Income' : 'Add Income';
    if (editTx) {
      $('#income-id').value = editTx.id;
      $('#income-amount').value = editTx.amount;
      $('#income-category').value = editTx.category;
      $('#income-description').value = editTx.description || '';
      $('#income-payment').value = editTx.payment_method || 'Cash';
      $('#income-date').value = editTx.transaction_date;
    } else {
      $('#income-form').reset();
      $('#income-id').value = '';
      $('#income-date').value = new Date().toISOString().slice(0, 10);
    }
  }

  async function submitExpense(e) {
    e.preventDefault();
    const errEl = $('#expense-error');
    errEl.classList.add('hidden');
    const amount = Number($('#expense-amount').value);
    if (!amount || amount <= 0) {
      errEl.textContent = 'Amount must be greater than 0';
      errEl.classList.remove('hidden');
      return;
    }
    showLoading(true);
    try {
      await saveTransaction({
        id: $('#expense-id').value || null,
        type: 'expense',
        amount,
        category: $('#expense-category').value,
        description: $('#expense-description').value,
        payment_method: $('#expense-payment').value,
        transaction_date: $('#expense-date').value
      });
      await loadAllData();
      renderDashboard();
      renderTransactionList();
      renderBudget();
      $('#expense-modal').classList.add('hidden');
      toast('Expense saved', 'success');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save';
      errEl.classList.remove('hidden');
    } finally {
      showLoading(false);
    }
  }

  async function submitIncome(e) {
    e.preventDefault();
    const errEl = $('#income-error');
    errEl.classList.add('hidden');
    const amount = Number($('#income-amount').value);
    if (!amount || amount <= 0) {
      errEl.textContent = 'Amount must be greater than 0';
      errEl.classList.remove('hidden');
      return;
    }
    showLoading(true);
    try {
      await saveTransaction({
        id: $('#income-id').value || null,
        type: 'income',
        amount,
        category: $('#income-category').value,
        description: $('#income-description').value,
        payment_method: $('#income-payment').value,
        transaction_date: $('#income-date').value
      });
      await loadAllData();
      renderDashboard();
      renderTransactionList();
      $('#income-modal').classList.add('hidden');
      toast('Income saved', 'success');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save';
      errEl.classList.remove('hidden');
    } finally {
      showLoading(false);
    }
  }

  async function submitBudget(e) {
    e.preventDefault();
    const errEl = $('#budget-error');
    errEl.classList.add('hidden');
    const amount = Number($('#budget-amount').value);
    if (!amount || amount <= 0) {
      errEl.textContent = 'Budget must be greater than 0';
      errEl.classList.remove('hidden');
      return;
    }
    showLoading(true);
    try {
      await saveBudget(amount);
      await loadAllData();
      renderDashboard();
      renderBudget();
      $('#budget-modal').classList.add('hidden');
      toast('Budget saved', 'success');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save budget';
      errEl.classList.remove('hidden');
    } finally {
      showLoading(false);
    }
  }

  // ---------- Event bindings ----------
  function bindEvents() {
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action], [data-page], [data-tab]');
      if (!btn) return;

      const action = btn.dataset.action;
      const page = btn.dataset.page;
      const tab = btn.dataset.tab;

      if (action === 'show-login') openAuth('login');
      if (action === 'show-signup') openAuth('signup');
      if (action === 'close-auth') closeAuth();
      if (action === 'logout') logout();
      if (action === 'open-expense') openExpense();
      if (action === 'open-income') openIncome();
      if (action === 'close-expense') $('#expense-modal').classList.add('hidden');
      if (action === 'close-income') $('#income-modal').classList.add('hidden');
      if (action === 'close-budget') $('#budget-modal').classList.add('hidden');
      if (action === 'edit-budget') {
        const stats = calcStats();
        $('#budget-amount').value = stats.budgetAmount || '';
        $('#budget-modal').classList.remove('hidden');
        $('#budget-error').classList.add('hidden');
      }
      if (action === 'edit-tx') {
        const id = btn.dataset.id;
        const tx = transactions.find(t => t.id === id);
        if (tx) {
          if (tx.type === 'expense') openExpense(tx);
          else openIncome(tx);
        }
      }
      if (action === 'delete-tx') {
        deleteTargetId = btn.dataset.id;
        $('#confirm-modal').classList.remove('hidden');
      }
      if (action === 'cancel-delete') {
        deleteTargetId = null;
        $('#confirm-modal').classList.add('hidden');
      }
      if (page) navigate(page);
      if (tab) {
        $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        $('#login-form').classList.toggle('hidden', tab !== 'login');
        $('#signup-form').classList.toggle('hidden', tab !== 'signup');
      }
    });

    $('#confirm-delete-btn')?.addEventListener('click', async () => {
      if (!deleteTargetId) return;
      showLoading(true);
      try {
        await deleteTransaction(deleteTargetId);
        await loadAllData();
        renderDashboard();
        renderTransactionList();
        renderBudget();
        toast('Transaction deleted', 'success');
      } catch (err) {
        toast(err.message || 'Delete failed', 'error');
      } finally {
        deleteTargetId = null;
        $('#confirm-modal').classList.add('hidden');
        showLoading(false);
      }
    });

    $('#login-form')?.addEventListener('submit', handleLogin);
    $('#signup-form')?.addEventListener('submit', handleSignup);
    $('#expense-form')?.addEventListener('submit', submitExpense);
    $('#income-form')?.addEventListener('submit', submitIncome);
    $('#budget-form')?.addEventListener('submit', submitBudget);
    $('#refresh-insights')?.addEventListener('click', loadInsights);

    const debouncedFilter = debounce(renderTransactionList, 200);
    $('#tx-search')?.addEventListener('input', debouncedFilter);
    $('#tx-filter-type')?.addEventListener('change', renderTransactionList);
    $('#tx-filter-category')?.addEventListener('change', renderTransactionList);
    $('#tx-filter-month')?.addEventListener('change', renderTransactionList);

    // Close modals on overlay click
    $$('.modal-overlay').forEach(ov => {
      ov.addEventListener('click', (e) => {
        if (e.target === ov) ov.classList.add('hidden');
      });
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal-overlay').forEach(m => m.classList.add('hidden'));
      }
    });
  }

  // ---------- IntersectionObserver for features ----------
  function setupScrollAnimations() {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      $$('[data-animate]').forEach(el => el.classList.add('in-view'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in-view'), i * 80);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    $$('[data-animate]').forEach(el => io.observe(el));
  }

  // ---------- Boot ----------
  async function init() {
    bindEvents();
    setupScrollAnimations();
    await loadConfig();
    supabase = initSupabase();

    if (!supabase) {
      showLanding();
      toast('Configure Supabase in .env to enable auth & data', 'info');
      return;
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
      }
      if (event === 'SIGNED_OUT') {
        currentUser = null;
      }
    });

    const session = await checkSession();
    if (session) {
      await onAuthSuccess(session);
    } else {
      showLanding();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
