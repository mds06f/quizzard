const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
const { auditLogger } = require('../middleware/auditLogger');
const { importQuizPackage, parseYAML, parseCSV, validateQuizPackage } = require('../services/quizImporter');

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

router.get('/', isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const search = (req.query.search || '').trim().toLowerCase();
    const limit = 10;

    const sections = await db.getAllSections();
    let questions = await db.getAllQuestions();

    // Map section names to questions for easy search indexing
    if (search) {
      questions = questions.filter(q => {
        const textMatch = q.text && q.text.toLowerCase().includes(search);
        const explanationMatch = q.explanation && q.explanation.toLowerCase().includes(search);
        const optionsMatch = q.options && q.options.some(opt => opt.toLowerCase().includes(search));
        
        const sec = sections.find(s => String(s.id) === String(q.sectionId));
        const sectionMatch = sec && sec.name.toLowerCase().includes(search);
        
        return textMatch || explanationMatch || optionsMatch || sectionMatch;
      });
    }

    const totalQuestions = questions.length;
    const totalPages = Math.ceil(totalQuestions / limit) || 1;
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * limit;
    const paginatedQuestions = questions.slice(startIndex, startIndex + limit);
    
    // Read audit logs
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '../logs/admin_audit.log');
    let auditLogs = [];
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      auditLogs = content.trim().split('\n').filter(Boolean).map(line => {
        return line;
      }).reverse(); // latest first
    }

    // Fetch Redis rate limiting metrics
    const cacheService = require('../services/cacheService');
    let rateLimitMetrics = { hits: 0, blocks: 0 };
    let rateLimitIps = [];

    if (cacheService.isRedisConnected()) {
      const redis = cacheService.getRedisClient();
      try {
        const today = new Date().toISOString().slice(0, 10);
        const metrics = await redis.hgetall(`ratelimit:metrics:${today}`);
        rateLimitMetrics.hits = parseInt(metrics.hits) || 0;
        rateLimitMetrics.blocks = parseInt(metrics.blocks) || 0;

        const ips = await redis.hgetall(`ratelimit:ips:${today}`);
        rateLimitIps = Object.entries(ips).map(([ip, count]) => ({
          ip,
          count: parseInt(count)
        })).sort((a, b) => b.count - a.count).slice(0, 5);
      } catch (err) {
        console.warn('Failed to fetch rate limit metrics from Redis:', err.message);
      }
    }
    
    res.render('admin/dashboard', { 
      sections, 
      questions: paginatedQuestions, 
      auditLogs,
      currentPage,
      totalPages,
      search,
      totalQuestions,
      rateLimitMetrics,
      rateLimitIps
    });
  } catch (err) {
    console.error('Error fetching admin data:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST add new section
router.post('/sections', isAdmin, auditLogger('CREATE_SECTION'), async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.redirect('/admin?error=invalid_topic_name');
  }
  try {
    await db.addSection(name.trim());
    res.redirect('/admin?success=section_created');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding section');
  }
});

// POST edit section
router.post('/sections/:id/edit', isAdmin, auditLogger('EDIT_SECTION'), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    await db.updateSection(id, name.trim());
    res.redirect('/admin?success=section_updated');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating section');
  }
});

// POST delete section
router.post('/sections/:id/delete', isAdmin, auditLogger('DELETE_SECTION'), async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteSection(id);
    res.redirect('/admin?success=section_deleted');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting section');
  }
});

// POST add question
router.post('/questions', isAdmin, auditLogger('CREATE_QUESTION'), async (req, res) => {
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
    res.redirect('/admin?success=question_created');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding question');
  }
});

// POST edit question
router.post('/questions/:id/edit', isAdmin, auditLogger('EDIT_QUESTION'), async (req, res) => {
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
    res.redirect('/admin?success=question_updated');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating question');
  }
});

// POST delete question
router.post('/questions/:id/delete', isAdmin, auditLogger('DELETE_QUESTION'), async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteQuestion(id);
    res.redirect('/admin?success=question_deleted');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting question');
  }
});

// GET export questions to CSV
router.get('/export-questions', isAdmin, async (req, res) => {
  try {
    const questions = await db.getAllQuestions();
    const headers = ['section_id', 'question', 'option1', 'option2', 'option3', 'option4', 'correct_option', 'difficulty', 'explanation'];
    let csvContent = headers.join(',') + '\n';
    
    questions.forEach(q => {
      const row = [
        q.section_id,
        `"${(q.question || '').replace(/"/g, '""')}"`,
        `"${(q.option1 || '').replace(/"/g, '""')}"`,
        `"${(q.option2 || '').replace(/"/g, '""')}"`,
        `"${(q.option3 || '').replace(/"/g, '""')}"`,
        `"${(q.option4 || '').replace(/"/g, '""')}"`,
        q.correct_option,
        `"${(q.difficulty || '').replace(/"/g, '""')}"`,
        `"${(q.explanation || '').replace(/"/g, '""')}"`
      ];
      csvContent += row.join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=questions.csv');
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('Error exporting questions:', err);
    res.status(500).send('Error exporting questions');
  }
});

// Helper to parse CSV strings
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}

// POST import questions from CSV
router.post('/import-questions', isAdmin, upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  
  try {
    const csvText = req.file.buffer.toString('utf8');
    const rows = parseCSV(csvText);
    
    if (rows.length <= 1) {
      return res.status(400).send('CSV file is empty or missing headers.');
    }
    
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const secIdIdx = headers.indexOf('section_id');
    const questionIdx = headers.indexOf('question');
    const opt1Idx = headers.indexOf('option1');
    const opt2Idx = headers.indexOf('option2');
    const opt3Idx = headers.indexOf('option3');
    const opt4Idx = headers.indexOf('option4');
    const correctIdx = headers.indexOf('correct_option');
    const diffIdx = headers.indexOf('difficulty');
    const expIdx = headers.indexOf('explanation');
    
    if (questionIdx === -1 || opt1Idx === -1 || opt2Idx === -1 || opt3Idx === -1 || opt4Idx === -1 || correctIdx === -1) {
      return res.status(400).send('CSV file missing required question/option columns.');
    }
    
    const sections = await db.getAllSections();
    const sectionIdsSet = new Set(sections.map(s => s.id));
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 6) continue;
      
      const questionText = row[questionIdx]?.trim();
      if (!questionText) continue;
      
      let sectionId = secIdIdx !== -1 ? parseInt(row[secIdIdx], 10) : null;
      if (isNaN(sectionId) || !sectionIdsSet.has(sectionId)) {
        sectionId = sections.length > 0 ? sections[0].id : 1;
      }
      
      const correctVal = correctIdx !== -1 ? parseInt(row[correctIdx], 10) : 1;
      const difficulty = diffIdx !== -1 ? (row[diffIdx]?.trim().toLowerCase() || 'medium') : 'medium';
      const explanation = expIdx !== -1 ? (row[expIdx]?.trim() || '') : '';
      
      await db.addQuestion(sectionId, {
        question: questionText,
        option1: row[opt1Idx]?.trim() || '',
        option2: row[opt2Idx]?.trim() || '',
        option3: row[opt3Idx]?.trim() || '',
        option4: row[opt4Idx]?.trim() || '',
        correct_option: isNaN(correctVal) ? 1 : correctVal,
        difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
        explanation: explanation
      });
    }
    
    res.redirect('/admin?success=questions_imported');
  } catch (err) {
    console.error('Error importing questions:', err);
    res.status(500).send('Error importing questions');
  }
});

// POST import section and questions package (JSON/CSV/YAML)
router.post('/sections/import', isAdmin, upload.single('importFile'), auditLogger('IMPORT_SECTION'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const fileName = req.file.originalname;
  const fileText = req.file.buffer.toString('utf8');
  let pkg = null;

  try {
    if (fileName.endsWith('.json')) {
      pkg = JSON.parse(fileText);
    } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
      pkg = parseYAML(fileText);
    } else if (fileName.endsWith('.csv')) {
      const sectionName = fileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      const parsed = parseCSV(fileText);
      pkg = {
        sectionName,
        questions: parsed.questions
      };
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload a JSON, CSV, or YAML file.' });
    }

    const validation = validateQuizPackage(pkg);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const section = await importQuizPackage(pkg);
    res.json({ message: 'Success', sectionId: section.id, sectionName: section.name });

  } catch (err) {
    console.error('Error during import:', err);
    res.status(500).json({ error: 'Server error during import: ' + err.message });
  }
});

module.exports = router;
