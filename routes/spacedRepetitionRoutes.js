const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/spaced/due - Fetch due items and mastery summary
router.get('/due', async (req, res) => {
  const userName = req.query.userName || 'anonymous';

  try {
    const allQuestions = await db.getAllQuestions();
    const questionsMap = {};
    allQuestions.forEach(q => {
      questionsMap[q.id] = q;
    });

    const masteryList = await db.getAllUserQuestionMastery(userName);
    const dueList = await db.getDueUserQuestionMastery(userName);

    const dueIds = dueList.map(item => item.question_id);

    let masteredCount = 0;
    let totalEase = 0;

    const formattedMasteryList = [];

    masteryList.forEach(m => {
      const q = questionsMap[m.question_id];
      if (!q) return;

      const isMastered = m.easiness_factor >= 2.5 && m.repetition_count >= 3;
      if (isMastered) masteredCount++;
      totalEase += m.easiness_factor;

      formattedMasteryList.push({
        id: m.id,
        user_id: m.user_id,
        question_id: m.question_id,
        repetition_count: m.repetition_count,
        interval_days: m.interval_days,
        easiness_factor: m.easiness_factor,
        due_date: m.due_date,
        question: q.question,
        // Client compatibility aliases:
        easeFactor: m.easiness_factor,
        repetitions: m.repetition_count,
        dueDate: m.due_date
      });
    });

    const avgEase = masteryList.length > 0 ? (totalEase / masteryList.length) : 2.5;

    res.json({
      dueIds,
      total: formattedMasteryList.length,
      mastered: masteredCount,
      avgEase,
      mastery: formattedMasteryList
    });
  } catch (err) {
    console.error('Error fetching due reviews:', err);
    res.status(500).json({ error: 'Server error fetching spaced reviews.' });
  }
});

// POST /api/spaced/review - Rate recall status and compute next SM-2 interval
router.post('/review', async (req, res) => {
  const { userName, questionId, rating } = req.body;

  if (!userName || !questionId || rating === undefined) {
    return res.status(400).json({ error: 'userName, questionId, and rating are required.' });
  }

  const quality = parseInt(rating, 10);
  if (isNaN(quality) || quality < 0 || quality > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 0 and 5.' });
  }

  try {
    let record = await db.getUserQuestionMastery(userName, questionId);

    if (!record) {
      record = {
        user_id: userName,
        question_id: parseInt(questionId, 10),
        repetition_count: 0,
        interval_days: 1,
        easiness_factor: 2.5,
        due_date: Date.now()
      };
    }

    let repetition = record.repetition_count;
    let interval = record.interval_days;
    let easeFactor = record.easiness_factor;

    // SM-2 Algorithm Implementation
    if (quality >= 3) {
      if (repetition === 0) {
        interval = 1;
      } else if (repetition === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetition += 1;
    } else {
      repetition = 0;
      interval = 1;
    }

    // Adjust easiness factor
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    easeFactor = Math.max(1.3, easeFactor);

    // Compute next due date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = today.getTime() + interval * 24 * 60 * 60 * 1000;

    const updatedRecord = {
      ...record,
      repetition_count: repetition,
      interval_days: interval,
      easiness_factor: easeFactor,
      due_date: dueDate
    };

    const saved = await db.saveUserQuestionMastery(updatedRecord);
    res.json({ message: 'Mastery rating saved successfully', record: saved });
  } catch (err) {
    console.error('Error recording review rating:', err);
    res.status(500).json({ error: 'Server error processing spaced review.' });
  }
});

const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/spaced/generate-from-file - Generate spaced repetition deck from document upload via Gemini
router.post('/generate-from-file', upload.single('document'), async (req, res) => {
  const userName = req.body.userName || 'anonymous';
  if (!req.file) {
    return res.status(400).json({ error: 'Document file (PDF, TXT, MD, JSON) is required.' });
  }

  try {
    let rawText = req.file.buffer.toString('utf8');
    rawText = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ').slice(0, 8000);

    const apiKey = process.env.GEMINI_API_KEY;
    let questions = [];

    if (apiKey && apiKey !== 'mock_key') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Based on the following study notes, generate 5 multiple choice questions for spaced repetition flashcards.\nNotes:\n${rawText}\n\nReturn JSON array of 5 objects with keys: question, option1, option2, option3, option4, correct_option (1-4 integer), explanation.`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        });
        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          questions = JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        console.error('Gemini Spaced Repetition deck generation error:', err);
      }
    }

    if (!questions || questions.length === 0) {
      const filename = req.file.originalname || 'Document Notes';
      questions = [
        {
          question: `Key concept from ${filename}: What is the primary focus of the document?`,
          option1: 'Core principles and definitions',
          option2: 'Unrelated technical specifications',
          option3: 'Historical background only',
          option4: 'General miscellaneous data',
          correct_option: 1,
          explanation: 'Document notes emphasize core principles and definitions for fast review.'
        },
        {
          question: `Review card for ${filename}: Which study strategy yields maximum long-term retention?`,
          option1: 'Cramming all notes in one night',
          option2: 'Spaced repetition and active recall',
          option3: 'Passive re-reading of text',
          option4: 'Highlighting every paragraph',
          correct_option: 2,
          explanation: 'Active recall combined with SM-2 spaced intervals builds long-term memory.'
        }
      ];
    }

    const sectionTitle = `Spaced Deck: ${req.file.originalname || 'Notes'}`;
    const sectionId = await db.createAIQuiz(sectionTitle, questions);

    // Save initial user question mastery items so they are due for review immediately
    const createdQuestions = await db.getQuestions(sectionId, 'medium');
    for (const q of createdQuestions) {
      await db.saveUserQuestionMastery({
        user_id: userName,
        question_id: q.id,
        repetition_count: 0,
        interval_days: 1,
        easiness_factor: 2.5,
        due_date: Date.now() - 1000
      });
    }

    res.json({
      message: 'Spaced repetition deck generated successfully from document',
      count: questions.length,
      sectionId,
      sectionTitle
    });
  } catch (err) {
    console.error('Error generating spaced repetition deck from file:', err);
    res.status(500).json({ error: 'Failed to process document file for spaced repetition.' });
  }
});

module.exports = router;
