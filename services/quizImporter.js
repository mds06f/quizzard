const db = require('../db');

// Parse YAML files line-by-line without external dependency
function parseYAML(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  let sectionName = '';
  const questions = [];
  let currentQuestion = null;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('sectionName:')) {
      sectionName = trimmed.substring(12).trim().replace(/^['"]|['"]$/g, '');
      continue;
    }

    if (trimmed.startsWith('-')) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      currentQuestion = {};
      
      const content = trimmed.substring(1).trim();
      const colonIdx = content.indexOf(':');
      if (colonIdx !== -1) {
        const key = content.substring(0, colonIdx).trim();
        const val = content.substring(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        currentQuestion[key] = val;
      }
    } else if (currentQuestion) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.substring(0, colonIdx).trim();
        const val = trimmed.substring(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key === 'correct_option') {
          currentQuestion[key] = parseInt(val, 10);
        } else {
          currentQuestion[key] = val;
        }
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  return { sectionName, questions };
}

// Parse CSV string using robust quote extraction
function parseCSV(text) {
  const questions = [];
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

  if (lines.length <= 1) return { questions: [] };

  const headers = lines[0].map(h => h.trim().toLowerCase());
  const questionIdx = headers.indexOf('question');
  const opt1Idx = headers.indexOf('option1');
  const opt2Idx = headers.indexOf('option2');
  const opt3Idx = headers.indexOf('option3');
  const opt4Idx = headers.indexOf('option4');
  const correctIdx = headers.indexOf('correct_option');
  const diffIdx = headers.indexOf('difficulty');
  const expIdx = headers.indexOf('explanation');

  for (let i = 1; i < lines.length; i++) {
    const r = lines[i];
    if (r.length < 6) continue;

    const q = r[questionIdx]?.trim();
    if (!q) continue;

    questions.push({
      question: q,
      option1: r[opt1Idx]?.trim() || '',
      option2: r[opt2Idx]?.trim() || '',
      option3: r[opt3Idx]?.trim() || '',
      option4: r[opt4Idx]?.trim() || '',
      correct_option: parseInt(r[correctIdx], 10),
      difficulty: r[diffIdx]?.trim() || 'medium',
      explanation: r[expIdx]?.trim() || ''
    });
  }

  return { questions };
}

// Validation function ensuring schema compliance
function validateQuizPackage(pkg) {
  const errors = [];
  if (!pkg.sectionName || typeof pkg.sectionName !== 'string' || !pkg.sectionName.trim()) {
    errors.push('Section name is required and must be a non-empty string.');
  }

  if (!pkg.questions || !Array.isArray(pkg.questions) || pkg.questions.length === 0) {
    errors.push('Quiz package must contain at least one question.');
    return { valid: false, errors };
  }

  pkg.questions.forEach((q, idx) => {
    const qNum = idx + 1;
    if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
      errors.push(`Question #${qNum}: Question text is required.`);
    }
    if (!q.option1 || typeof q.option1 !== 'string' || !q.option1.trim()) {
      errors.push(`Question #${qNum}: Option 1 is required.`);
    }
    if (!q.option2 || typeof q.option2 !== 'string' || !q.option2.trim()) {
      errors.push(`Question #${qNum}: Option 2 is required.`);
    }
    if (!q.option3 || typeof q.option3 !== 'string' || !q.option3.trim()) {
      errors.push(`Question #${qNum}: Option 3 is required.`);
    }
    if (!q.option4 || typeof q.option4 !== 'string' || !q.option4.trim()) {
      errors.push(`Question #${qNum}: Option 4 is required.`);
    }
    
    const correct = parseInt(q.correct_option, 10);
    if (isNaN(correct) || correct < 1 || correct > 4) {
      errors.push(`Question #${qNum}: Correct option must be an integer between 1 and 4 (got "${q.correct_option || ''}").`);
    }

    if (q.difficulty && !['easy', 'medium', 'hard'].includes(q.difficulty.toLowerCase().trim())) {
      errors.push(`Question #${qNum}: Difficulty must be 'easy', 'medium', or 'hard' (got "${q.difficulty}").`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

async function importQuizPackage(pkg) {
  const validation = validateQuizPackage(pkg);
  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  // Create section
  const section = await db.addSection(pkg.sectionName.trim());
  
  // Insert questions
  for (const q of pkg.questions) {
    await db.addQuestion(section.id, {
      question: q.question.trim(),
      option1: q.option1.trim(),
      option2: q.option2.trim(),
      option3: q.option3.trim(),
      option4: q.option4.trim(),
      correct_option: parseInt(q.correct_option, 10),
      difficulty: (q.difficulty || 'medium').toLowerCase().trim(),
      explanation: (q.explanation || '').trim()
    });
  }

  return section;
}

module.exports = {
  parseYAML,
  parseCSV,
  validateQuizPackage,
  importQuizPackage
};
