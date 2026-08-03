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

module.exports = router;
