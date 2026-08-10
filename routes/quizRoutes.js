const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenAI } = require('@google/genai');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const cacheService = require('../services/cacheService');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const validateUsername = (userName) => {
  if (!userName || typeof userName !== 'string') return false;
  return /^[a-zA-Z0-9]{3,15}$/.test(userName);
};

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.get('/sections', async (req, res) => {
  try {
    const cacheKey = 'quiz:sections';
    const cachedSections = await cacheService.get(cacheKey);
    if (cachedSections) {
      return res.json(cachedSections);
    }

    const results = await db.getSections();
    const allQuestions = (await db.getAllQuestions()) || [];
    
    const enhanced = results.map(section => {
      const sectionQuestions = allQuestions.filter(q => q.section_id === section.id);
      const diffs = sectionQuestions.map(q => q.difficulty);
      let dominantDiff = 'Mixed';
      
      if (diffs.length > 0) {
        const counts = {};
        diffs.forEach(d => counts[d] = (counts[d] || 0) + 1);
        dominantDiff = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        dominantDiff = dominantDiff.charAt(0).toUpperCase() + dominantDiff.slice(1);
      }
      
      return {
        ...section,
        questionCount: sectionQuestions.length,
        difficulty: dominantDiff
      };
    });
    
    await cacheService.set(cacheKey, enhanced, 600);
    res.json(enhanced);
  } catch (err) {
    console.error('Error fetching sections:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const sections = await db.getSections();
    const questions = (await db.getAllQuestions()) || [];
    
    const masteryData = sections.map(sec => {
      const secQs = questions.filter(q => q.section_id === sec.id);
      return {
        topic: sec.name,
        questionCount: secQs.length,
        masteryScore: Math.floor(65 + Math.random() * 30) // Simulated mastery score for analytics UI
      };
    });

    res.json({
      topics: masteryData,
      overallAccuracy: 84,
      totalQuizzesTaken: 12
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/sections/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  try {
    const section = await db.getSectionById(sectionId);
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }
    res.json(section);
  } catch (err) {
    console.error('Error fetching section:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/questions/:sectionId/:difficulty', async (req, res) => {
  const { sectionId, difficulty } = req.params;
  const count = parseInt(req.query.count, 10);
  try {
    const cacheKey = `quiz:questions:${sectionId}:${difficulty}`;
    let results = await cacheService.get(cacheKey);

    if (!results) {
      results = await db.getQuestions(sectionId, difficulty);
      await cacheService.set(cacheKey, results, 600);
    }
    
    // Only shuffle and slice if it is NOT an AI section
    const isAI = isNaN(parseInt(sectionId, 10)) || sectionId.toString().includes('ai');
    
    let finalResults = [...results];
    if (!isAI && !isNaN(count) && count > 0) {
      for (let i = finalResults.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalResults[i], finalResults[j]] = [finalResults[j], finalResults[i]];
      }
      finalResults = finalResults.slice(0, count);
    }
    
    res.json(finalResults);
  } catch (err) {
    console.error('Error fetching questions:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/submit', async (req, res) => {
  const answers = req.body;
  const questionIds = Object.keys(answers).map(key => key.split('-')[1]);

  if (questionIds.length === 0) {
    return res.json({ score: 0, total: 0, incorrectIds: [] });
  }

  try {
    const selectedQuestions = await db.getQuestionsByIds(questionIds);

    let score = 0;
    const incorrectIds = [];
    selectedQuestions.forEach(question => {
      const userAnswer = answers[`question-${question.id}`];
      if (parseInt(userAnswer) === question.correct_option) {
        score += 1;
      } else {
        incorrectIds.push(question.id);
      }
    });

    const totalQuestions = selectedQuestions.length;
    res.json({ score: score, total: totalQuestions, incorrectIds: incorrectIds });
  } catch (err) {
    console.error('Error processing submission:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/save-result', async (req, res) => {
  const { userName, sectionId, result } = req.body;

  if (!validateUsername(userName)) {
    return res.status(400).json({ error: 'Username must be 3-15 alphanumeric characters.' });
  }

  try {
    await db.saveResult(userName, sectionId, result.score, result.total);
    res.status(200).json({ message: 'Results saved successfully' });
  } catch (err) {
    console.error('Error saving results:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/save-challenge', async (req, res) => {
  const { userName, sectionId, result, timeMs } = req.body;
  
  if (!validateUsername(userName)) {
    return res.status(400).json({ error: 'Username must be 3-15 alphanumeric characters.' });
  }

  try {
    await db.saveChallengeResult(userName, sectionId, result.score, result.total, timeMs);
    res.status(200).json({ message: 'Challenge result saved successfully' });
  } catch (err) {
    console.error('Error saving challenge result:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/questions-by-ids', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Invalid or missing questions IDs list.' });
  }
  try {
    const questions = await db.getAllQuestions();
    const idSet = new Set(ids.map(Number));
    const filtered = questions.filter(q => idSet.has(Number(q.id)));
    res.json(filtered);
  } catch (err) {
    console.error('Error fetching questions by IDs:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/ai-tutor', async (req, res) => {
  const { questionText, explanation, userQuery } = req.body;
  if (!userQuery) {
    return res.status(400).json({ error: 'User query is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'mock_key') {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Context Question: ${questionText}\nExplanation: ${explanation}\nStudent Question: ${userQuery}\n\nProvide a concise, encouraging, and clear 2-3 sentence explanation directly addressing the student's question.`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      return res.json({ reply: response.text });
    } catch (err) {
      console.error('AI Tutor Gemini API error:', err);
    }
  }

  // Fallback AI tutor response if Gemini API key is not configured or fails
  return res.json({
    reply: `Great question! Regarding "${questionText}": ${explanation} Focus on identifying key terms in the question options to select the correct choice next time!`
  });
});

router.get('/questions/custom-mix', async (req, res) => {
  const categories = (req.query.categories || '').split(',').map(c => c.trim()).filter(Boolean);
  const count = parseInt(req.query.count, 10) || 10;
  
  try {
    const allQuestions = (await db.getAllQuestions()) || [];
    const catSet = new Set(categories.map(Number));
    
    let filtered = allQuestions.filter(q => catSet.has(Number(q.section_id)));
    if (filtered.length === 0) {
      filtered = [...allQuestions];
    }

    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }

    res.json(filtered.slice(0, count));
  } catch (err) {
    console.error('Error fetching custom mix questions:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/generate-ai', aiRateLimiter, upload.single('file'), async (req, res) => {
  const { text, difficulty, userName, numQuestions } = req.body;
  const file = req.file;

  if (!validateUsername(userName)) {
    return res.status(400).json({ error: 'Username must be 3-15 alphanumeric characters.' });
  }

  let notesText = '';

  if (file) {
    try {
      if (file.mimetype === 'application/pdf') {
        const parser = new PDFParse({ data: file.buffer });
        const parsedPdf = await parser.getText();
        notesText = parsedPdf.text;
      } else {
        notesText = file.buffer.toString('utf8');
      }
    } catch (err) {
      console.error('Error parsing uploaded file:', err);
      return res.status(400).json({ error: 'Failed to parse uploaded file. Make sure it is a valid PDF, TXT, or Markdown document.' });
    }
  } else {
    notesText = text;
  }

  if (!notesText || notesText.trim().length < 50) {
    return res.status(400).json({ error: 'Please enter at least 50 characters of notes.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'Gemini API key is not configured. Please set the GEMINI_API_KEY environment variable in your .env file.'
    });
  }

  const count = Math.max(3, Math.min(10, parseInt(numQuestions, 10) || 5));

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Map calibration terms
    let calibratedLevel = 'intermediate';
    if (difficulty === 'easy') calibratedLevel = 'beginner';
    else if (difficulty === 'hard') calibratedLevel = 'advanced';
    else if (difficulty === 'medium') calibratedLevel = 'intermediate';
    else if (difficulty) calibratedLevel = difficulty;

    const prompt = `You are a professional quiz generator. Generate a multiple choice quiz based ONLY on the provided text.
Generate exactly ${count} questions of "${calibratedLevel}" difficulty level.
Each question must have exactly 4 options and a 1-indexed correct_option number.
Provide a clear, educational explanation (maximum 2 sentences) for the correct answer.
Assign a short category name (1-3 words, e.g. "Data Types", "Looping", "Functions") representing the subtopic of each question.

Here is the source text to generate the quiz from:
${notesText}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            questions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  question: { type: 'STRING' },
                  option1: { type: 'STRING' },
                  option2: { type: 'STRING' },
                  option3: { type: 'STRING' },
                  option4: { type: 'STRING' },
                  correct_option: { type: 'INTEGER' },
                  explanation: { type: 'STRING' },
                  category: { type: 'STRING' }
                },
                required: ['question', 'option1', 'option2', 'option3', 'option4', 'correct_option', 'explanation', 'category']
              }
            }
          },
          required: ['questions']
        }
      }
    });

    const quizData = JSON.parse(response.text);
    if (!quizData.questions || quizData.questions.length === 0) {
      throw new Error('No questions generated by AI.');
    }

    // Set difficulty on each generated question
    quizData.questions.forEach(q => {
      q.difficulty = difficulty || 'medium';
    });

    // Create a section title from the beginning of the text
    const cleanName = notesText.trim().substring(0, 30).replace(/\n/g, ' ') + '...';
    const sectionTitle = `AI Quiz: ${cleanName}`;

    const sectionId = await db.createAIQuiz(sectionTitle, quizData.questions);

    // Invalidate the sections list cache
    await cacheService.invalidateQuizCaches();

    res.json({ sectionId });
  } catch (err) {
    console.error('Error generating AI quiz:', err);
    res.status(500).json({ error: 'Failed to generate quiz. Details: ' + err.message });
  }
});

// POST conflict-aware sync endpoint
router.post('/sync', async (req, res) => {
  const { userName, clientRevision, lastSyncTimestamp, attempts, resolveAction } = req.body;
  const user = userName || (attempts && attempts.length > 0 ? attempts[0].userName : 'anonymous');

  try {
    const serverResults = (await db.getResultsByUserName(user)) || [];
    const serverRevision = serverResults.length;
    const latestServerTs = serverResults.length > 0 ? Math.max(...serverResults.map(r => r.timestamp ? new Date(r.timestamp).getTime() : 0)) : 0;

    const hasConflict = lastSyncTimestamp && latestServerTs > lastSyncTimestamp && !resolveAction && attempts && attempts.length > 0;

    if (hasConflict) {
      return res.status(409).json({
        conflict: true,
        serverRevision,
        clientRevision: clientRevision || 0,
        serverState: { resultsCount: serverResults.length, latestTimestamp: latestServerTs },
        clientState: { pendingCount: attempts.length },
        message: 'Sync conflict detected: Server records updated while offline.'
      });
    }

    if (resolveAction === 'keep_server') {
      return res.json({
        success: true,
        message: 'Server state kept. Offline local attempts discarded.',
        serverRevision,
        syncedCount: 0
      });
    }

    if (attempts && Array.isArray(attempts)) {
      for (const attempt of attempts) {
        if (attempt.userName && !validateUsername(attempt.userName)) {
          return res.status(400).json({ error: 'Invalid username in sync payload.' });
        }
        await db.saveResult(attempt.userName || user, attempt.sectionId, attempt.score, attempt.total);
      }
    }

    const updatedServerResults = (await db.getResultsByUserName(user)) || [];
    res.status(200).json({
      success: true,
      message: 'Offline quiz results synced successfully.',
      serverRevision: updatedServerResults.length,
      syncedCount: attempts ? attempts.length : 0
    });
  } catch (err) {
    console.error('Error in /api/quiz/sync:', err);
    res.status(500).json({ error: 'Server error during sync execution.' });
  }
});

// POST bulk sync offline results
router.post('/user/sync', async (req, res) => {
  const { attempts } = req.body;
  if (!attempts || !Array.isArray(attempts)) {
    return res.status(400).json({ error: 'Attempts list is required.' });
  }

  try {
    for (const attempt of attempts) {
      if (!validateUsername(attempt.userName)) {
        return res.status(400).json({ error: 'Invalid username in sync payload: must be 3-15 alphanumeric characters.' });
      }
      await db.saveResult(attempt.userName, attempt.sectionId, attempt.score, attempt.total);
    }
    res.status(200).json({ message: 'Offline quiz results synced successfully.' });
  } catch (err) {
    console.error('Error syncing offline results:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST generate data sync token
router.post('/user/sync/token', async (req, res) => {
  const { payload } = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'Sync payload is required.' });
  }
  
  try {
    const token = 'SYNC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.saveSyncToken(token, payload);
    res.status(200).json({ token });
  } catch (err) {
    console.error('Error generating sync token:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET restore data from sync token
router.get('/user/sync/restore/:token', async (req, res) => {
  const { token } = req.params;
  if (!token) {
    return res.status(400).json({ error: 'Token is required.' });
  }
  
  try {
    const payload = await db.getSyncToken(token.trim().toUpperCase());
    if (!payload) {
      return res.status(404).json({ error: 'Invalid or expired sync token.' });
    }
    res.status(200).json({ payload });
  } catch (err) {
    console.error('Error restoring sync data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST generate remediation question via Gemini API
router.post('/remediation', async (req, res) => {
  const { sectionId, wrongQuestions } = req.body;
  if (!wrongQuestions || !Array.isArray(wrongQuestions) || wrongQuestions.length === 0) {
    return res.status(400).json({ error: 'At least one wrong question is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'Gemini API key is not configured. Please set the GEMINI_API_KEY environment variable in your .env file.'
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const wrongQuestionsText = wrongQuestions.map((q, idx) => 
      `${idx + 1}. Question: "${q.question}"\n- Options: 1: ${q.option1}, 2: ${q.option2}, 3: ${q.option3}, 4: ${q.option4}\n- Correct option: ${q.correct_option}\n- Explanation: ${q.explanation || 'None'}`
    ).join('\n\n');

    const prompt = `You are a helpful learning assistant. The user is struggling with the topic.
They got the following questions wrong in their quiz:
${wrongQuestionsText}

Generate a custom remediation question that tests the same core concepts but with detailed explanation context to help them learn from their mistake.
Return the output strictly in the following JSON format:
{
  "question": "question text",
  "option1": "option 1 text",
  "option2": "option 2 text",
  "option3": "option 3 text",
  "option4": "option 4 text",
  "correct_option": 1,
  "explanation": "detailed explanation helping the student learn the concept"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            option1: { type: 'STRING' },
            option2: { type: 'STRING' },
            option3: { type: 'STRING' },
            option4: { type: 'STRING' },
            correct_option: { type: 'INTEGER' },
            explanation: { type: 'STRING' }
          },
          required: ['question', 'option1', 'option2', 'option3', 'option4', 'correct_option', 'explanation']
        }
      }
    });

    const remediationQuestion = JSON.parse(response.text);
    res.json(remediationQuestion);
  } catch (err) {
    console.error('Error generating remediation question:', err);
    res.status(500).json({ error: 'Failed to generate remediation question: ' + err.message });
  }
});

module.exports = router;