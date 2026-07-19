const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to verify admin session
function isAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

// GET admin login page
router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: null });
});

// POST admin login submit
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password === adminPassword) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.render('admin/login', { error: 'Invalid password. Please try again.' });
  }
});

// GET admin logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// GET admin dashboard listing sections & questions
router.get('/', isAdmin, async (req, res) => {
  try {
    const sections = await db.getAllSections();
    const questions = await db.getAllQuestions();
    res.render('admin/dashboard', { sections, questions });
  } catch (err) {
    console.error('Error fetching admin data:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST add new section
router.post('/sections', isAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.redirect('/admin');
  }
  try {
    await db.addSection(name.trim());
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding section');
  }
});

// POST edit section
router.post('/sections/:id/edit', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    await db.updateSection(id, name.trim());
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating section');
  }
});

// POST delete section
router.post('/sections/:id/delete', isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteSection(id);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting section');
  }
});

// POST add question
router.post('/questions', isAdmin, async (req, res) => {
  const { section_id, question, option1, option2, option3, option4, correct_option, difficulty, explanation, category } = req.body;
  try {
    await db.addQuestion(section_id, {
      question: question.trim(),
      option1: option1.trim(),
      option2: option2.trim(),
      option3: option3.trim(),
      option4: option4.trim(),
      correct_option: parseInt(correct_option, 10),
      difficulty,
      explanation: explanation ? explanation.trim() : '',
      category: category ? category.trim() : ''
    });
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding question');
  }
});

// POST edit question
router.post('/questions/:id/edit', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { question, option1, option2, option3, option4, correct_option, difficulty, explanation, category } = req.body;
  try {
    await db.updateQuestion(id, {
      question: question.trim(),
      option1: option1.trim(),
      option2: option2.trim(),
      option3: option3.trim(),
      option4: option4.trim(),
      correct_option: parseInt(correct_option, 10),
      difficulty,
      explanation: explanation ? explanation.trim() : '',
      category: category ? category.trim() : ''
    });
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating question');
  }
});

// POST delete question
router.post('/questions/:id/delete', isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteQuestion(id);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting question');
  }
});

module.exports = router;
