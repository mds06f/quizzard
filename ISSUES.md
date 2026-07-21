# Good First Issues & Feature Roadmap 🚀

Welcome! If you are looking to contribute to **Quizzard**, here is a curated list of issues, feature requests, and enhancement suggestions.

We have categorized them by difficulty to help you find the perfect task to start with.

---

## 🟢 Easy (Good First Issues)

### 1. Confetti Animation on Perfect Score
* **Description**: We want to celebrate when a user gets a 100% score on a quiz by triggering a canvas confetti animation.
* **Component**: `views/result.ejs` (client-side script)
* **Goal**: 
  - Include the `canvas-confetti` script via CDN.
  - In `result.ejs`, check if the score equals the total questions, and trigger a confetti burst if it does.

### 2. Add New Quiz Categories & Questions
* **Description**: Expand the preset categories available to users (e.g., adding "Python Basics" or "Git Commands").
* **Component**: `db.js` (inside the `defaultData` object)
* **Goal**: Add a new section in the `sections` array and 5-10 related questions in the `questions` array. Make sure they include correct options and explanations.

### 20. Option Selection Vibration & Sound Toggle
* **Description**: Add settings controls to let mobile/desktop users toggle audio effects on/off and enable tactile haptic feedback.
* **Component**: `views/welcome.ejs`, `views/index.ejs`
* **Goal**:
  - Add simple settings checkbox panel to the Welcome screen.
  - Implement a toggle saving configuration to `localStorage`.
  - Trigger `navigator.vibrate([30])` when users tap option cards (if supported).

### 21. Visual Progress Bar Indicator
* **Description**: Build a smooth horizontal progress bar at the top of the quiz page indicating advancement.
* **Component**: `views/index.ejs`
* **Goal**:
  - Insert a progress tracker div container.
  - Update layout width dynamically from `0%` to `100%` based on answered progress.

### 22. Clear Explanations Review Cache
* **Description**: Add controls on the quiz results screen to clear userAnswers caches so users can start fresh attempts.
* **Component**: `views/result.ejs`
* **Goal**: Place a "Reset Quiz Progress" action button next to review selections that clears `localStorage` response data.

### 23. Preset Categories Search & Filters
* **Description**: Allow searching/filtering of preset categories when standard topics lists scale up.
* **Component**: `views/welcome.ejs`
* **Goal**: Add a text search input above the standard select list to filter drop-down option displays dynamically.

### 24. HUD Session Correct-Streak Tracker
* **Description**: Add an in-quiz score HUD tracking consecutive correct answers in the current session.
* **Component**: `views/index.ejs`
* **Goal**: Display a fire/streak HUD icon. Increment on correct options selection, and reset back to 0 on incorrect choice.

---

## 🟡 Medium (Intermediate Tasks)

### 3. Countdown Timer per Question
* **Description**: Introduce pressure by giving users a set amount of time (e.g., 20 seconds) to answer each question.
* **Component**: `views/index.ejs`
* **Goal**:
  - Add a countdown progress bar at the top of the quiz card.
  - If the timer hits zero, highlight correct/incorrect options and lock the question or proceed to the next.

### 4. Social Share & Copy Results
* **Description**: Let users share their scores with friends.
* **Component**: `views/result.ejs`
* **Goal**: Add a "Share Score" button that copies a preformatted text block (e.g. *"I scored 5/5 on the Science quiz on Quizzard! Can you beat me?"*) to the clipboard.

### 5. Light / Cream Theme Option
* **Description**: Provide a toggle to switch from the default Warm Charcoal dark theme to a clean light/cream theme.
* **Component**: `views/welcome.ejs`, `views/index.ejs`, `views/result.ejs`
* **Goal**: Add a floating sun/moon toggle button in the header and toggle class-based color schemes on click. Persist the preference in `localStorage`.

### 6. Question Bookmarking
* **Description**: Let users bookmark questions they found tricky so they can review them later.
* **Component**: `views/index.ejs`, `views/result.ejs`
* **Goal**:
  - Add a bookmark icon on each question card during the quiz.
  - On the result screen, show a collapsible "Bookmarked Questions" section listing the flagged items with explanations.
  - Persist bookmarks in `localStorage`.

### 7. Quiz History / Past Attempts
* **Description**: Show users a log of their previous quiz attempts so they can track their progress over time.
* **Component**: `views/result.ejs`, `views/welcome.ejs`
* **Goal**:
  - After each quiz, save a summary (date, category, score, total) to `localStorage`.
  - Render a "History" tab or panel on the welcome page listing the last N attempts.
  - Include a "Clear History" button.

### 8. Randomized Answer Order
* **Description**: Currently, answer options appear in a fixed order. Shuffle them on each quiz attempt to prevent answer-pattern memorisation.
* **Component**: `routes/quizRoutes.js` or `views/index.ejs` (client-side shuffle)
* **Goal**:
  - Implement a Fisher-Yates shuffle on the options array before rendering each question.
  - Ensure the correct answer index is updated accordingly so scoring still works.

### 9. Keyboard Navigation Support
* **Description**: Power users want to answer questions using only the keyboard for a faster quiz experience.
* **Component**: `views/index.ejs`
* **Goal**:
  - Map keys `1`–`4` (or `A`–`D`) to the four answer options.
  - Map `Enter` or `Space` to confirm the selected answer and advance.
  - Add a subtle visual indicator showing the currently focused option.

### 10. Result Score Breakdown by Category
* **Description**: When a quiz spans multiple categories (e.g., an AI-generated quiz), show a breakdown of correct/incorrect answers per topic.
* **Component**: `views/result.ejs`, `routes/quizRoutes.js`
* **Goal**:
  - Group questions by their `sectionId` or category tag.
  - Render a mini bar chart or table on the result screen showing performance per category.

### 11. Configurable Question Count
* **Description**: Allow users to choose how many questions they want in their quiz before starting (e.g., 5, 10, 15, or 20).
* **Component**: `views/welcome.ejs`, `routes/quizRoutes.js`
* **Goal**:
  - Add a pill-selector or slider to the quiz setup panel.
  - Pass the selected count to the backend and slice/randomise the question pool accordingly.

### 25. Dynamic Timer Limit based on Difficulty
* **Description**: Adjust the question countdown timer threshold dynamically depending on selected difficulty (e.g., Easy = 30s, Medium = 20s, Hard = 12s).
* **Component**: `views/welcome.ejs`, `views/index.ejs`
* **Goal**: Bind dynamic seconds variables based on the active session's difficulty and trigger corresponding interval durations.

### 26. Study Progress Export & Backup
* **Description**: Give users ability to download historical quiz records and spaced repetition intervals data.
* **Component**: `views/welcome.ejs`
* **Goal**: Add an "Export Study History" button that serializes local storage states into downloadable JSON logs.

### 27. Topic Details Tooltips on Welcome Select
* **Description**: Show previews of average scores, completion status, and question counts below target category selectors.
* **Component**: `views/welcome.ejs`
* **Goal**: Update layouts on change event list hooks to show description details fetched dynamically from sections meta.

### 28. Automated System Dark/Light Mode Auto-Detection
* **Description**: Detect system preferences to pre-select default light/dark themes.
* **Component**: `views/welcome.ejs`, `views/index.ejs`, `views/result.ejs`
* **Goal**: Query `window.matchMedia('(prefers-color-scheme: light)')` and toggle theme class configurations if no explicit config resides in localStorage.

### 29. Section Classification Tags
* **Description**: Tag preset topics with category labels (e.g., Programming, Humanities, Science) and support topic filtering by tag.
* **Component**: `views/welcome.ejs`, `db.js`
* **Goal**: Update database scheme. Render visual classification tags and support filtering by select tab elements on the dashboard.

### 30. Audio Click Tone Waveform Selectors
* **Description**: Let users select sound waveforms (Retro Arcade, Minimalist Tone) in setting dropdowns.
* **Component**: `views/welcome.ejs`, `views/index.ejs`
* **Goal**: Integrate Web Audio oscillator wave types to play custom pitch sets depending on user selection.

---

## 🔴 Hard (Advanced Features)

### 12. Document File Upload for AI Quizzes
* **Description**: Instead of copy-pasting notes, let users upload PDF, TXT, or Markdown documents to feed into the Gemini quiz generator.
* **Component**: `views/welcome.ejs` (frontend form) and `routes/quizRoutes.js` (multer file parsing backend)
* **Goal**:
  - Add a file drag-and-drop zone to the AI tab.
  - Parse the file content on the server and pass the extracted text to the Gemini API.

### 13. Daily Study Streak Tracker
* **Description**: Gamify learning by tracking if a user completes at least one quiz every day.
* **Component**: `views/welcome.ejs` and `views/result.ejs`
* **Goal**: Use client-side `localStorage` to save completion timestamps, calculate the current consecutive day streak, and display a flame badge showing the streak in the header.

### 14. Multiplayer / Head-to-Head Quiz Mode
* **Description**: Let two users race through the same quiz simultaneously and see who answers faster.
* **Component**: `server.js`, `routes/quizRoutes.js`, `views/index.ejs`
* **Goal**:
  - Integrate Socket.io to create a real-time room system.
  - One user creates a room and shares a code; the other joins via the code.
  - Both see the same question simultaneously. First to lock in the correct answer scores a point.
  - Display a live scoreboard on both screens.

### 15. Admin Dashboard for Content Management
* **Description**: Give maintainers a password-protected web UI to manage quiz sections and questions without touching `db.js` directly.
* **Component**: New route `routes/adminRoutes.js`, new views `views/admin/`
* **Goal**:
  - Build a simple login page gated by an `ADMIN_PASSWORD` env variable.
  - Implement CRUD pages for Sections and Questions backed by `db.js`.
  - Protect all admin routes with a session-based middleware check.

### 16. AI Quiz Difficulty Calibration
* **Description**: After a quiz, use the user's score to automatically adjust the difficulty of the next AI-generated quiz on the same topic.
* **Component**: `routes/quizRoutes.js`, `views/result.ejs`, `views/welcome.ejs`
* **Goal**:
  - Store recent scores per topic in `localStorage`.
  - Pass a `difficulty` hint (`"beginner"`, `"intermediate"`, `"advanced"`) derived from the average score to the Gemini prompt.
  - Show the selected difficulty level to the user before they start.

### 17. Timed Challenge Mode with Global Leaderboard
* **Description**: A special speed-run mode where users race to complete the full quiz as fast as possible, with results posted to a public leaderboard.
* **Component**: `server.js`, `db.js`, `routes/quizRoutes.js`, `views/result.ejs`
* **Goal**:
  - Add a "Challenge Mode" option that records total completion time in milliseconds.
  - Persist top-10 scores per category in `db.json` via a POST endpoint.
  - Render a public leaderboard page at `/leaderboard/:sectionId`.

### 18. Progressive Web App (PWA) Support
* **Description**: Make Quizzard installable and usable offline so students can practice without an internet connection.
* **Component**: `server.js` (static asset serving), new `public/sw.js` service worker, `public/manifest.json`
* **Goal**:
  - Create a `manifest.json` with app name, icons, and theme color.
  - Implement a service worker that caches all EJS-rendered pages and static assets on first load.
  - Allow users to install Quizzard to their home screen on mobile.
  - Ensure previously loaded quiz categories are available offline.

### 19. Spaced Repetition Review System
* **Description**: Build a smart review mode that surfaces questions the user has previously answered incorrectly, prioritised by how long ago they got them wrong.
* **Component**: `views/welcome.ejs`, `views/index.ejs`, `views/result.ejs`
* **Goal**:
  - Track per-question attempt history (correct/incorrect + timestamp) in `localStorage`.
  - Implement a basic SM-2 spaced repetition algorithm to schedule reviews.
  - Add a "Review Due" tab on the welcome page showing the count of questions due for review today.

### 31. Spaced Repetition Mastery Board
* **Description**: Build a detailed dashboard visualizing scheduled spacing logs, next review dates, and mastery scores for each question.
* **Component**: `views/welcome.ejs`
* **Goal**: Create a dashboard listing card items showing E-factor values, repetitions counters, and a retention breakdown visual grid.

### 32. Bulk CSV Questions Import/Export
* **Description**: Let admin managers import or export questions in bulk using standard CSV format.
* **Component**: `routes/adminRoutes.js`, `views/admin/dashboard.ejs`
* **Goal**: Add file reader zones on admin forms. Parse CSV uploads on the server, validate, save entries to `db.json`, and provide CSV download tools.

### 33. Live Multiplayer Cooperative Study Room
* **Description**: Support cooperative study modes where up to 4 users answer questions together as a group.
* **Component**: `server.js`, `views/index.ejs`, Socket.io events
* **Goal**: Synchronize live questions and answers amongst users, and display a aggregate progress scorecard comparing teams accuracy.

### 34. Cloud Account Data Sync
* **Description**: Allow users to sync study statistics, achievements, and spaced repetition state parameters.
* **Component**: `views/welcome.ejs`, new endpoint `/api/user/sync`
* **Goal**: Develop key backup tokens that upload/download serialized statistics arrays to allow study synchronization across multiple devices.

### 35. LLM-Driven Adaptive Learning Remediation
* **Description**: Automatically trigger background Gemini generation to generate explainer slides/questions if user struggles with a subtopic tag.
* **Component**: `routes/quizRoutes.js`, `views/index.ejs`
* **Goal**: Track tag accuracy. If accuracy falls below 50%, call Gemini API to insert a custom remediation question with detail context.

### 36. Voice Commands Speech-to-Text Mode
* **Description**: Support hands-free option selections and quiz navigation using native voice input commands.
* **Component**: `views/index.ejs`
* **Goal**: Integrate the Web Speech API to listen to voice selections and automatically submit cards.

---

## How to Get Started 🛠️

1. **Pick an Issue**: Comment on the GitHub issue tracker (or choose one from this file) that you want to work on.
2. **Create a Branch**: Create a feature branch off of `development`:
   ```bash
   git checkout -b feature/your-feature-name development
   ```
3. **Write the Code**: Follow our [CONTRIBUTING.md](./CONTRIBUTING.md) guide.
4. **Push and PR**: Push your branch and open a PR targeting the `development` branch!
