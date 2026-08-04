const { parseYAML, parseCSV, validateQuizPackage } = require('../../services/quizImporter');

describe('Quiz Importer Service Tests', () => {
  describe('validateQuizPackage', () => {
    it('should validate a correct quiz package', () => {
      const validPkg = {
        sectionName: 'Science Quiz',
        questions: [
          {
            question: 'What is water made of?',
            option1: 'Hydrogen',
            option2: 'Oxygen',
            option3: 'Both',
            option4: 'None',
            correct_option: 3,
            difficulty: 'easy'
          }
        ]
      };
      
      const validation = validateQuizPackage(validPkg);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should collect errors for missing fields', () => {
      const invalidPkg = {
        sectionName: '',
        questions: [
          {
            question: '',
            option1: '',
            option2: 'Opt 2',
            option3: 'Opt 3',
            option4: 'Opt 4',
            correct_option: 5,
            difficulty: 'unknown'
          }
        ]
      };
      
      const validation = validateQuizPackage(invalidPkg);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Section name is required and must be a non-empty string.');
      expect(validation.errors).toContain('Question #1: Question text is required.');
      expect(validation.errors).toContain('Question #1: Option 1 is required.');
      expect(validation.errors).toContain('Question #1: Correct option must be an integer between 1 and 4 (got "5").');
      expect(validation.errors).toContain('Question #1: Difficulty must be \'easy\', \'medium\', or \'hard\' (got "unknown").');
    });
  });

  describe('parseCSV', () => {
    it('should parse valid CSV quiz rows', () => {
      const csvText = `question,option1,option2,option3,option4,correct_option,difficulty,explanation\n"What is 1+1?",1,2,3,4,2,easy,"Basic math"`;
      const result = parseCSV(csvText);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toBe('What is 1+1?');
      expect(result.questions[0].correct_option).toBe(2);
      expect(result.questions[0].difficulty).toBe('easy');
      expect(result.questions[0].explanation).toBe('Basic math');
    });
  });

  describe('parseYAML', () => {
    it('should parse YAML content line-by-line', () => {
      const yamlText = `
sectionName: Geometry Rules
questions:
  - question: What is a triangle angle sum?
    option1: 90
    option2: 180
    option3: 270
    option4: 360
    correct_option: 2
    difficulty: medium
    explanation: Triangle angles sum to 180 degrees.
`;
      const result = parseYAML(yamlText);
      expect(result.sectionName).toBe('Geometry Rules');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toBe('What is a triangle angle sum?');
      expect(result.questions[0].correct_option).toBe(2);
      expect(result.questions[0].difficulty).toBe('medium');
      expect(result.questions[0].explanation).toBe('Triangle angles sum to 180 degrees.');
    });
  });

  describe('Audit Logger Middleware Tests', () => {
    const fs = require('fs');
    const path = require('path');
    const { auditLog } = require('../../middleware/auditLogger');
    const logFile = path.join(__dirname, '..', '..', 'logs', 'admin_audit.log');

    it('should write timestamped entries to admin_audit.log', () => {
      if (fs.existsSync(logFile)) {
        try {
          fs.unlinkSync(logFile);
        } catch (e) {}
      }

      auditLog('TEST_ACTION', 'TestTarget', '127.0.0.1', 'admin');

      expect(fs.existsSync(logFile)).toBe(true);
      const content = fs.readFileSync(logFile, 'utf8');
      expect(content).toContain('Action: TEST_ACTION');
      expect(content).toContain('Target: TestTarget');
      expect(content).toContain('IP: 127.0.0.1');
      expect(content).toContain('AdminID: admin');
    });
  });
});
