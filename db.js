const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

const defaultData = {
  sections: [
    { id: 1, name: 'General Knowledge' },
    { id: 2, name: 'Science' },
    { id: 3, name: 'Python Basics' }
  ],
  questions: [
    { id: 1, section_id: 1, question: 'What is the capital of France?', option1: 'London', option2: 'Berlin', option3: 'Paris', option4: 'Rome', correct_option: 3, difficulty: 'easy' },
    { id: 2, section_id: 1, question: 'Which planet is known as the Red Planet?', option1: 'Earth', option2: 'Mars', option3: 'Jupiter', option4: 'Saturn', correct_option: 2, difficulty: 'easy' },
    { id: 3, section_id: 1, question: 'Who wrote "To Kill a Mockingbird"?', option1: 'Harper Lee', option2: 'F. Scott Fitzgerald', option3: 'Ernest Hemingway', option4: 'Mark Twain', correct_option: 1, difficulty: 'medium' },
    { id: 4, section_id: 1, question: 'What is the largest ocean on Earth?', option1: 'Atlantic Ocean', option2: 'Indian Ocean', option3: 'Arctic Ocean', option4: 'Pacific Ocean', correct_option: 4, difficulty: 'medium' },
    { id: 5, section_id: 1, question: 'What is the speed of light in a vacuum (approx)?', option1: '300,000 km/s', option2: '150,000 km/s', option3: '450,000 km/s', option4: '100,000 km/s', correct_option: 1, difficulty: 'hard' },
    { id: 6, section_id: 2, question: 'What is the chemical symbol for water?', option1: 'O2', option2: 'H2O', option3: 'CO2', option4: 'NaCl', correct_option: 2, difficulty: 'easy' },
    { id: 7, section_id: 2, question: 'What gas do plants absorb during photosynthesis?', option1: 'Oxygen', option2: 'Nitrogen', option3: 'Carbon Dioxide', option4: 'Hydrogen', correct_option: 3, difficulty: 'easy' },
    { id: 8, section_id: 2, question: 'What is the power house of the cell?', option1: 'Nucleus', option2: 'Mitochondria', option3: 'Ribosome', option4: 'Golgi apparatus', correct_option: 2, difficulty: 'medium' },
    { id: 9, section_id: 2, question: 'Which element has the atomic number 1?', option1: 'Helium', option2: 'Oxygen', option3: 'Hydrogen', option4: 'Carbon', correct_option: 3, difficulty: 'medium' },
    { id: 10, section_id: 2, question: 'What is the only metal that is liquid at room temperature?', option1: 'Mercury', option2: 'Lead', option3: 'Iron', option4: 'Copper', correct_option: 1, difficulty: 'hard' },
    {
      id: 11,
      section_id: 3,
      question: 'Which keyword is used to define a function in Python?',
      option1: 'func',
      option2: 'define',
      option3: 'def',
      option4: 'function',
      correct_option: 3,
      difficulty: 'easy',
      explanation: 'The def keyword is used to define functions in Python.'
    },
    {
      id: 12,
      section_id: 3,
      question: 'Which symbol is used for comments in Python?',
      option1: '//',
      option2: '#',
      option3: '--',
      option4: '/* */',
      correct_option: 2,
      difficulty: 'easy',
      explanation: 'Python uses # for single-line comments.'
    },
    {
      id: 13,
      section_id: 3,
      question: 'What is the output of len("Python")?',
      option1: '5',
      option2: '6',
      option3: '7',
      option4: '8',
      correct_option: 2,
      difficulty: 'medium',
      explanation: 'The word Python contains 6 characters.'
    },
    {
      id: 14,
      section_id: 3,
      question: 'Which data type stores True or False values?',
      option1: 'str',
      option2: 'int',
      option3: 'bool',
      option4: 'list',
      correct_option: 3,
      difficulty: 'medium',
      explanation: 'The bool type stores Boolean values.'
    },
    {
      id: 15,
      section_id: 3,
      question: 'What will be the output of print(type([]))?',
      option1: "&lt;class 'tuple'&gt;",
      option2: "&lt;class 'list'&gt;",
      option3: "&lt;class 'dict'&gt;",
      option4: "&lt;class 'set'&gt;",
      correct_option: 2,
      difficulty: 'hard',
      explanation: 'Square brackets create a list object in Python.'
    }

  ],
  results: []
};

// Reads data from the JSON file. If it doesn't exist, it creates and seeds it.
function readData() {
  if (!fs.existsSync(DB_FILE)) {
    writeData(defaultData);
    return defaultData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading JSON DB, returning default:', err);
    return defaultData;
  }
}

// Writes data to the JSON file.
function writeData(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing JSON DB:', err);
  }
}

// Reset/reseed database helper
function resetDatabase() {
  writeData(defaultData);
  console.log('Database reset to seed data.');
}

const db = {
  // Reset utility
  reset: resetDatabase,

  // Get all sections
  getSections: async () => {
    const data = readData();
    return data.sections.filter(s => !s.is_ai);
  },

  // Get single section by ID
  getSectionById: async (id) => {
    const data = readData();
    const sectionId = parseInt(id, 10);
    return data.sections.find(s => s.id === sectionId) || null;
  },

  // Get questions by section ID and difficulty
  getQuestions: async (sectionId, difficulty) => {
    const data = readData();
    const secId = parseInt(sectionId, 10);
    return data.questions.filter(q => q.section_id === secId && q.difficulty === difficulty);
  },

  // Get questions by an array of IDs (or a single ID/string of IDs)
  getQuestionsByIds: async (ids) => {
    const data = readData();
    const idList = Array.isArray(ids) ? ids.map(id => parseInt(id, 10)) : [parseInt(ids, 10)];
    return data.questions.filter(q => idList.includes(q.id));
  },

  // Save quiz result
  saveResult: async (userName, sectionId, score, total) => {
    const data = readData();
    const newResult = {
      id: data.results.length > 0 ? Math.max(...data.results.map(r => r.id)) + 1 : 1,
      user_name: userName,
      section_id: parseInt(sectionId, 10),
      score: parseInt(score, 10),
      total: parseInt(total, 10)
    };
    data.results.push(newResult);
    writeData(data);
    return newResult;
  },

  // Create AI quiz section and questions
  createAIQuiz: async (title, questions) => {
    const data = readData();
    const newSectionId = data.sections.length > 0 ? Math.max(...data.sections.map(s => s.id)) + 1 : 1;

    // Add new section
    data.sections.push({
      id: newSectionId,
      name: title,
      is_ai: true
    });

    // Add questions
    let nextQuestionId = data.questions.length > 0 ? Math.max(...data.questions.map(q => q.id)) + 1 : 1;
    questions.forEach(q => {
      data.questions.push({
        id: nextQuestionId++,
        section_id: newSectionId,
        question: q.question,
        option1: q.option1,
        option2: q.option2,
        option3: q.option3,
        option4: q.option4,
        correct_option: parseInt(q.correct_option, 10),
        difficulty: q.difficulty || 'medium',
        explanation: q.explanation || '',
        category: q.category || ''
      });
    });

    writeData(data);
    return newSectionId;
  }
};

// Auto-initialize db file on module load if it doesn't exist
readData();

module.exports = db;
