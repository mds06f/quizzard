const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const quizRoutes = require('../../routes/quizRoutes');
const db = require('../../db');

jest.mock('../../db', () => ({
  getSections: jest.fn(),
  getSectionById: jest.fn(),
  getQuestions: jest.fn(),
  getQuestionsByIds: jest.fn(),
  getAllQuestions: jest.fn(),
  saveResult: jest.fn(),
  createAIQuiz: jest.fn()
}));

jest.mock('@google/genai', () => {
  const mGenerateContent = jest.fn().mockResolvedValue({
    text: JSON.stringify({
      questions: [
        {
          question: 'Mock AI question?',
          option1: 'A',
          option2: 'B',
          option3: 'C',
          option4: 'D',
          correct_option: 1,
          explanation: 'Mock AI explanation.'
        }
      ]
    })
  });

  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: mGenerateContent
      }
    }))
  };
});

const app = express();
app.use(bodyParser.json());
app.use('/api/quiz', quizRoutes);

describe('Quiz Routes', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('GET /api/quiz/sections should return sections', async () => {
    db.getSections.mockResolvedValueOnce([
      { id: 1, name: 'Math' },
      { id: 2, name: 'Science' }
    ]);
    db.getAllQuestions.mockResolvedValueOnce([
      { id: 101, section_id: 1, difficulty: 'easy' },
      { id: 102, section_id: 1, difficulty: 'easy' },
      { id: 103, section_id: 2, difficulty: 'hard' }
    ]);

    const response = await request(app).get('/api/quiz/sections');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 1, name: 'Math', questionCount: 2, difficulty: 'Easy' },
      { id: 2, name: 'Science', questionCount: 1, difficulty: 'Hard' }
    ]);
  });

  test('GET /api/quiz/sections/:sectionId should return the section if it exists', async () => {
    db.getSectionById.mockResolvedValueOnce({ id: 1, name: 'Math' });

    const response = await request(app).get('/api/quiz/sections/1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1, name: 'Math' });
  });

  test('GET /api/quiz/sections/:sectionId should return 404 if it does not exist', async () => {
    db.getSectionById.mockResolvedValueOnce(null);

    const response = await request(app).get('/api/quiz/sections/999');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Section not found' });
  });

  test('GET /api/quiz/questions/:sectionId/:difficulty should return questions', async () => {
    const sectionId = 1;
    const difficulty = 'easy';

    db.getQuestions.mockResolvedValueOnce([
      { id: 1, question: 'What is 2+2?', option1: '3', option2: '4', option3: '5', option4: '6', correct_option: 2 },
      { id: 2, question: 'What is 3+3?', option1: '5', option2: '6', option3: '7', option4: '8', correct_option: 2 }
    ]);

    const response = await request(app).get(`/api/quiz/questions/${sectionId}/${difficulty}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 1, question: 'What is 2+2?', option1: '3', option2: '4', option3: '5', option4: '6', correct_option: 2 },
      { id: 2, question: 'What is 3+3?', option1: '5', option2: '6', option3: '7', option4: '8', correct_option: 2 }
    ]);
  });

  test('POST /api/quiz/submit should calculate and return the score', async () => {
    const answers = {
      'question-1': '2',
      'question-2': '3'
    };

    db.getQuestionsByIds.mockResolvedValueOnce([
      { id: 1, correct_option: 2 },
      { id: 2, correct_option: 3 }
    ]);

    const response = await request(app)
      .post('/api/quiz/submit')
      .send(answers)
      .set('Accept', 'application/json');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ score: 2, total: 2 });
  });

  test('POST /api/quiz/save-result should save the result', async () => {
    const resultData = {
      userName: 'Test User',
      sectionId: 1,
      result: { score: 3, total: 5 }
    };

    db.saveResult.mockResolvedValueOnce({ id: 1, user_name: 'Test User', section_id: 1, score: 3, total: 5 });

    const response = await request(app)
      .post('/api/quiz/save-result')
      .send(resultData)
      .set('Accept', 'application/json');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Results saved successfully' });
  });

  test('POST /api/quiz/generate-ai should generate questions and save them', async () => {
    process.env.GEMINI_API_KEY = 'mock_key';
    db.createAIQuiz.mockResolvedValueOnce(99);

    const postData = {
      text: 'This is a long piece of mock notes that has more than fifty characters to pass validation correctly.',
      difficulty: 'medium',
      userName: 'Test User',
      numQuestions: 5
    };

    const response = await request(app)
      .post('/api/quiz/generate-ai')
      .send(postData)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sectionId: 99 });
  });

  test('POST /api/quiz/generate-ai should return error if text is too short', async () => {
    const postData = {
      text: 'too short',
      difficulty: 'medium',
      userName: 'Test User'
    };

    const response = await request(app)
      .post('/api/quiz/generate-ai')
      .send(postData)
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Please enter at least 50 characters of notes.' });
  });

  test('POST /api/quiz/generate-ai should return error if API key is not configured', async () => {
    delete process.env.GEMINI_API_KEY;

    const postData = {
      text: 'This is a long piece of mock notes that has more than fifty characters to pass validation correctly.',
      difficulty: 'medium',
      userName: 'Test User'
    };

    const response = await request(app)
      .post('/api/quiz/generate-ai')
      .send(postData)
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Gemini API key is not configured');
  });

  test('POST /api/quiz/questions-by-ids should return the filtered questions', async () => {
    db.getAllQuestions.mockResolvedValueOnce([
      { id: 1, question: 'Q1' },
      { id: 2, question: 'Q2' },
      { id: 3, question: 'Q3' }
    ]);

    const response = await request(app)
      .post('/api/quiz/questions-by-ids')
      .send({ ids: [1, 3] })
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 1, question: 'Q1' },
      { id: 3, question: 'Q3' }
    ]);
  });
});