# Contributing to Quizzard

Thank you for your interest in contributing to Quizzard! We are thrilled to welcome you. This project is specifically designed to be beginner-friendly for full-stack, EJS, and AI integration practice.

This guide will explain the codebase architecture, branching workflows, and details on how to make your first contribution.

---

## 🚀 Branching & PR Workflow

To keep the repository clean and structured, please follow this flow:
1. **Target Branch**: The `development` branch is the main active branch for contributions.
2. **Branching Out**: Create your branch off of `development`:
   ```bash
   git checkout -b feature/my-feature-name development
   # or
   git checkout -b bugfix/my-bugfix-name development
   ```
3. **Running Checks**: Before committing, ensure the application starts and that all tests pass locally:
   ```bash
   npm test
   ```
4. **Submit PR**: Push your branch to your fork and submit a PR targeting the `development` branch. Fill out the PR template checklist completely.

---

## 📂 Codebase Architecture

Here is the directory structure:
```text
quizzard/
├── routes/
│   └── quizRoutes.js       # Express REST endpoints
├── scripts/
│   └── dbReset.js          # Reset script for the database file
├── tests/
│   └── routes/
│       └── quizRoutes.test.js  # Jest tests
├── views/
│   ├── welcome.ejs         # Onboarding EJS page
│   ├── index.ejs           # Quiz execution EJS page
│   └── result.ejs          # Score presentation EJS page
├── db.js                   # Zero-config local JSON database driver
└── db.json                 # Auto-generated local database file (do not commit)
```

---

## 🧠 How to Add a New Standard Quiz Category (Step-by-Step)

Adding standard/pre-seeded quiz categories involves modifying the default database state inside [db.js](file:///Users/sandydev/quizzard/db.js).

### Step 1: Add a New Section in `db.js`
Open `db.js` and locate the `defaultData` object. Add a new section to the `sections` array with a unique `id` and a `name`:
```javascript
const defaultData = {
  sections: [
    { id: 1, name: 'General Knowledge' },
    { id: 2, name: 'Science' },
    { id: 3, name: 'Web Accessibility' } // Added new section
  ],
  ...
```

### Step 2: Add Questions linked to the Section
Add your questions to the `questions` array in the same `defaultData` object. Match the `section_id` with the new section's ID:
```javascript
  questions: [
    ...
    // Web Accessibility questions (section_id: 3)
    {
      id: 11,
      section_id: 3,
      question: 'What does WCAG stand for?',
      option1: 'Web Content Accessibility Guidelines',
      option2: 'Web Core Application Group',
      option3: 'Widget Common Access Group',
      option4: 'Wide Compatibility Access Guild',
      correct_option: 1,
      difficulty: 'easy',
      explanation: 'WCAG stands for Web Content Accessibility Guidelines, which provides recommendations for making Web content more accessible.'
    }
  ]
```

### Step 3: Run the database setup script to seed it
To re-initialize your local database file (`db.json`) with the new seed categories and questions, run:
```bash
npm run db:setup
```
Open [http://localhost:3000](http://localhost:3000) to verify your new category is visible in the dropdown selection box!

---

## 🧪 Writing & Running Tests

If you add a new endpoint or update route handlers, write corresponding unit tests in [quizRoutes.test.js](file:///Users/sandydev/quizzard/tests/routes/quizRoutes.test.js) using **Jest** and **Supertest**.

Run the test suite to verify code correctness:
```bash
npm test
```

---

## 🛠️ Pull Request Checklist
Before opening a PR, double check:
- [ ] No local configuration files (like `.env` or `db.json`) are committed (check `.gitignore`).
- [ ] The code runs without warnings in the browser console.
- [ ] No hardcoded personal API keys or credentials exist in the codebase.
- [ ] All unit tests pass (`npm test`).
- [ ]  Your changes follow the spirit of our [Code of Conduct](./CODE_OF_CONDUCT.md).
