# StudentSpend

**Your money. Your control.**

A premium student expense tracker built for students in Pakistan. Track pocket money, expenses, and savings in PKR — without the spreadsheet headache.

![Stack](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)

---

## Features

- **PKR-first** design for Pakistani students
- **Auth** — Sign up / Log in with Supabase Authentication
- **Dashboard** — Balance, income, spent, budget remaining (animated)
- **Transactions** — Add, edit, delete expenses & income with categories and payment methods (Cash, JazzCash, Easypaisa, Bank, Card)
- **Budget system** — Monthly budget, progress bar, warnings, recommended daily limit
- **Analytics** — Chart.js doughnut (by category), bar charts (monthly spending, income vs expenses)
- **AI Insights** — Backend-powered spending analysis (optional, key never exposed to frontend)
- **Premium dark UI** — Glassmorphism, gradients, micro-interactions, responsive mobile bottom nav
- **Security** — Row Level Security so users only see their own data

---

## Tech stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Frontend     | HTML5, CSS3, Vanilla JavaScript     |
| Charts       | Chart.js                            |
| Backend      | Node.js + Express                   |
| Database     | PostgreSQL via Supabase             |
| Auth         | Supabase Authentication             |
| AI (optional)| Configurable OpenAI-compatible API  |

**No React, Next.js, TypeScript, Tailwind, Vue, or Angular.**

---

## Folder structure

```
student-expense-tracker/
├── public/
│   ├── index.html      # Landing + app shell + modals
│   ├── style.css       # Premium dark UI
│   └── app.js          # Client logic (auth, CRUD, charts)
├── server.js           # Express server + AI route
├── package.json
├── .env.example
├── .gitignore
├── supabase-schema.sql # Tables + RLS + profile trigger
└── README.md
```

---

## Prerequisites

- Node.js **18+**
- A free [Supabase](https://supabase.com) project
- (Optional) An AI API key for insights (OpenAI, Groq, Together, or any OpenAI-compatible endpoint)

---

## Setup

### 1. Install dependencies

```bash
cd student-expense-tracker
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project  
2. Wait for the database to be ready  
3. Open **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`

### 3. Run the database schema

1. In Supabase, open **SQL Editor**  
2. Paste the entire contents of `supabase-schema.sql`  
3. Click **Run**  

This creates:

- `profiles` (linked to `auth.users`)
- `transactions` (income / expense)
- `budgets` (per user, per month)
- Row Level Security policies (users only access their own rows)
- A trigger that auto-creates a profile on signup

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Optional — leave blank to disable AI insights
AI_API_KEY=
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
```

**Never commit `.env`.** It is listed in `.gitignore`.

### 5. Run locally

Development (auto-restart on file changes):

```bash
npm run dev
```

Production-style:

```bash
npm start
```

Open **http://localhost:3000**

---

## How authentication works

1. User signs up with full name, email, password  
2. Supabase Auth creates the user  
3. Database trigger inserts a row into `profiles`  
4. Frontend uses the **anon key** + user session; RLS ensures every query is scoped to `auth.uid()`  
5. Session is persisted by Supabase client (local storage)

**Service role keys are never used in this app.** Do not put them in frontend or in the Express routes that serve the browser.

---

## AI Insights

- Endpoint: `POST /api/ai/insights`  
- The frontend sends a **summary** of spending (totals, categories, previous month) — not raw secrets  
- The server calls your configured AI API with `AI_API_KEY`  
- The key is **never** sent to the browser  

If `AI_API_KEY` or `AI_API_URL` is missing, the app shows a graceful fallback message.

Compatible with any OpenAI-style chat completions API (OpenAI, Groq, Together, local proxies, etc.).

---

## Payment methods & categories

**Expenses:** Food, Transport, Education, Shopping, Entertainment, Sports, Mobile / Internet, Subscriptions, Stationery, Other  

**Income sources:** Pocket Money, Gift, Freelancing, Part-time Work, Scholarship, Other  

**Payment methods:** Cash, JazzCash, Easypaisa, Bank, Card, Other  

---

## Security notes

- All financial tables use **Row Level Security**  
- Users can only SELECT / INSERT / UPDATE / DELETE their own rows  
- AI API key stays on the server  
- No service-role key in client code  
- Input validation on amounts and required fields  
- HTML escaped when rendering user descriptions  

---

## Deploy

1. Set the same environment variables on your host (Render, Railway, Fly.io, VPS, etc.)  
2. Run `npm install` and `npm start`  
3. Ensure your Supabase project allows your production URL under **Authentication → URL Configuration** if you use email redirects  

For a static-host + separate API setup, point the frontend fetch base URL to your Express server and serve `public/` from any static host — but the included Express app already serves the static files and API together.

---

## Scripts

| Command        | Description                    |
|----------------|--------------------------------|
| `npm install`  | Install dependencies           |
| `npm run dev`  | Start with `--watch` (Node 18+) |
| `npm start`    | Start server                   |

---

## License

MIT — use it, fork it, ship it for your campus.

---

**StudentSpend** · Built for students in Pakistan · ₨ first
