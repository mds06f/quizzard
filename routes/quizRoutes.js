const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenAI } = require('@google/genai');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.get('/sections', async (req, res) => {
  try {
    const results = await db.getSections();
    res.json(results);
  } catch (err) {
    console.error('Error fetching sections:', err);
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
    const results = await db.getQuestions(sectionId, difficulty);
    
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
    return res.json({ score: 0, total: 0 });
  }

  try {
    const selectedQuestions = await db.getQuestionsByIds(questionIds);

    let score = 0;
    selectedQuestions.forEach(question => {
      const userAnswer = answers[`question-${question.id}`];
      if (parseInt(userAnswer) === question.correct_option) {
        score += 1;
      }
    });

    const totalQuestions = selectedQuestions.length;
    res.json({ score: score, total: totalQuestions });
  } catch (err) {
    console.error('Error processing submission:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/save-result', async (req, res) => {
  const { userName, sectionId, result } = req.body;

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
  try {
    await db.saveChallengeResult(userName, sectionId, result.score, result.total, timeMs);
    res.status(200).json({ message: 'Challenge result saved successfully' });
  } catch (err) {
    console.error('Error saving challenge result:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/generate-ai', upload.single('file'), async (req, res) => {
  const { text, difficulty, userName, numQuestions } = req.body;
  const file = req.file;

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

    res.json({ sectionId });
  } catch (err) {
    console.error('Error generating AI quiz:', err);
    res.status(500).json({ error: 'Failed to generate quiz. Details: ' + err.message });
  }
});

module.exports = router;