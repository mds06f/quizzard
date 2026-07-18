# Quizzard 🧙‍♂️

An interactive, AI-powered quiz platform and custom study engine. Quizzard allows users to take standard tests across multiple difficulty levels, or paste custom study notes/documentation to dynamically generate custom multiple-choice quizzes with detailed, educational explanations on-the-fly using Google Gemini.

This project is designed specifically to be beginner-friendly for full-stack and open-source learning, featuring a zero-configuration local database and an automated local setup.

---

## 🛠️ Tech Stack & Architecture

Quizzard is built using a simple, modular server-rendered architecture:

- **Frontend Interface (`/views`)**:
  - **Engine**: EJS (Embedded JavaScript) templates rendering dynamic pages server-side.
  - **Styling**: Modern, custom Vanilla CSS and Tailwind CSS, featuring a sleek, glassmorphic **Warm Charcoal & Gold/Amber** design theme.
  - **Gamification**: Visual score gauge charts, concept reviews, and active selection feedback (correct vs incorrect option highlighting).
- **Backend API & Server**:
  - **Server**: Express.js handling page rendering and API endpoints.
  - **AI Integration**: Official Google GenAI SDK (`@google/genai`) connecting to `gemini-2.5-flash` with strict JSON schemas to generate custom questions.
  - **Database (`db.js` & `db.json`)**: Zero-dependency filesystem-based JSON database. No external database engines (like MySQL, MongoDB) or credentials are required. It automatically seeds initial categories (General Knowledge, Science) on its first run.
- **Continuous Integration (`.github/workflows`)**:
  - Automated CI workflow (`ci.yml`) runs tests and builds the application on every push or Pull Request.

---

## 📂 Repository Layout

```text
quizzard/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md          # Template for reporting bugs
│   │   ├── feature_request.md     # Template for requesting features
│   │   └── new_quiz_category.md   # Template for suggesting quiz categories
│   ├── PULL_REQUEST_TEMPLATE.md   # Template for pull request submissions
│   └── workflows/
│       └── ci.yml                 # GitHub Actions runner to run tests
├── routes/
│   └── quizRoutes.js              # REST endpoints for categories, questions, and submission
├── scripts/
│   └── dbReset.js                 # Re-initializes db.json to seed questions
├── tests/
│   └── routes/
│       └── quizRoutes.test.js     # Jest/Supertest route test suite
├── views/
│   ├── welcome.ejs                # The onboarding & AI paste welcome tab layout
│   ├── index.ejs                  # The quiz answering viewport with styled options
│   └── result.ejs                 # Result page with Circular Score Gauge and Explanations
├── db.js                          # Local database helper module
├── db.json                        # Git-ignored local DB file (initialized dynamically)
├── server.js                      # Express server entry point
├── render.yaml                    # Free tier Render deployment configuration
└── package.json                   # Dependencies and npm script wrappers
```

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
Make sure Node.js (v18.0.0 or higher) and npm (v9.0.0 or higher) are installed on your machine.

### 2. Clone the Project & Install Dependencies
Clone the repository, enter the folder, and install packages:
```bash
# Clone the repository
git clone <your-fork-url>

# Navigate into the project folder
cd quizzard

# Install dependencies
npm install
```

### 3. Configure the Environment
Create a `.env` file in the root of the project to enable the AI generator:
```env
GEMINI_API_KEY=your_google_gemini_api_key
PORT=3000
```
*(You can get a free developer key from [Google AI Studio](https://ai.google.dev/aistudio))*

### 4. Run the Application
Start the development server with live-reloads:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to start quizzing! The local database file (`db.json`) will be generated and seeded automatically.

---

## 📡 API Endpoints

### Standard Endpoints
- `GET /api/quiz/sections` — Fetch list of available categories.
- `GET /api/quiz/sections/:sectionId` — Fetch metadata of a single section.
- `GET /api/quiz/questions/:sectionId/:difficulty` — Fetch questions for a topic and difficulty level.
- `POST /api/quiz/submit` — Grade and score an answer sheet.
- `POST /api/quiz/save-result` — Save the quiz results to the database.

### AI Endpoints
- `POST /api/quiz/generate-ai` — Generate questions from copy-pasted notes using Gemini.
  - **Body**: `{ "text": "notes...", "difficulty": "medium", "numQuestions": 5 }`

---

## 🧪 Testing

Run the test suite using Jest:
```bash
npm test
```

---

## 🤝 Contributing Guidelines

We welcome contributions of all kinds! Whether you want to fix a bug, add a new layout feature, or write questions, Quizzard is designed to be accessible.

1. Review our [Good First Issues & Feature Roadmap](./ISSUES.md) to pick an open task.
2. Review our contributing standards and scope in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).  
3. Review our onboarding step-by-step instructions in [CONTRIBUTING.md](./CONTRIBUTING.md).
4. **Workflow Rules**:
   - Always branch off from the `development` branch (e.g. `git checkout -b feature/your-feature development`).
   - Run tests (`npm test`) before submitting code.
   - Open a PR targeting the `development` branch of the upstream repository.
