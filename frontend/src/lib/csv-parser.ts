/**
 * CSV Parser Utility for Question Import
 * 
 * Provides functions for parsing CSV files containing quiz questions,
 * validating data, generating templates, and triggering downloads.
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5
 */

import type { QuestionFormData } from '@/app/admin/quiz/components/question-builder';

/**
 * Supported question types
 */
export type CSVQuestionType = 'MULTIPLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE' | 'SCALE_1_10' | 'NUMBER_INPUT';

/**
 * Validation result for a single field
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Parsed question with validation status
 */
export interface ParsedQuestion {
  rowNumber: number;
  data: Partial<QuestionFormData>;
  isValid: boolean;
  errors: { column: string; message: string }[];
}

/**
 * Overall parse result
 */
export interface ParseResult {
  questions: ParsedQuestion[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

/**
 * CSV column definition
 */
interface CSVColumn {
  name: string;
  required: boolean;
  validator: (value: string) => ValidationResult;
}

// Column validators
const validators = {
  questionText: (value: string): ValidationResult => {
    if (!value || value.trim().length === 0) {
      return { isValid: false, error: 'Question text is required' };
    }
    return { isValid: true };
  },

  questionType: (value: string): ValidationResult => {
    const validTypes: CSVQuestionType[] = ['MULTIPLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE', 'SCALE_1_10', 'NUMBER_INPUT'];
    if (!value || !validTypes.includes(value.toUpperCase() as CSVQuestionType)) {
      return { isValid: false, error: `Invalid question type. Must be one of: ${validTypes.join(', ')}` };
    }
    return { isValid: true };
  },

  timeLimit: (value: string): ValidationResult => {
    if (!value) return { isValid: true }; // Optional, will use default
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 5 || num > 120) {
      return { isValid: false, error: 'Time limit must be between 5 and 120 seconds' };
    }
    return { isValid: true };
  },

  basePoints: (value: string): ValidationResult => {
    if (!value) return { isValid: true }; // Optional, will use default
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 100 || num > 10000) {
      return { isValid: false, error: 'Base points must be between 100 and 10000' };
    }
    return { isValid: true };
  },

  speedBonusMultiplier: (value: string): ValidationResult => {
    if (!value) return { isValid: true }; // Optional, will use default
    const num = parseFloat(value);
    if (isNaN(num) || num < 0.1 || num > 2.0) {
      return { isValid: false, error: 'Speed bonus multiplier must be between 0.1 and 2.0' };
    }
    return { isValid: true };
  },

  boolean: (value: string): ValidationResult => {
    if (!value) return { isValid: true }; // Optional
    const lower = value.toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lower)) {
      return { isValid: false, error: 'Must be true/false, yes/no, or 1/0' };
    }
    return { isValid: true };
  },

  url: (value: string): ValidationResult => {
    if (!value) return { isValid: true }; // Optional
    try {
      new URL(value);
      return { isValid: true };
    } catch {
      return { isValid: false, error: 'Invalid URL format' };
    }
  },

  correctOptions: (value: string): ValidationResult => {
    if (!value || value.trim().length === 0) {
      return { isValid: false, error: 'At least one correct option is required' };
    }
    const options = value.split(';').map(o => o.trim().toUpperCase());
    const validOptions = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const opt of options) {
      if (!validOptions.includes(opt)) {
        return { isValid: false, error: `Invalid option "${opt}". Must be A-F` };
      }
    }
    return { isValid: true };
  },
};

/**
 * Column definitions for CSV parsing
 */
const CSV_COLUMNS: CSVColumn[] = [
  { name: 'question_text', required: true, validator: validators.questionText },
  { name: 'question_type', required: true, validator: validators.questionType },
  { name: 'option_a', required: false, validator: () => ({ isValid: true }) },
  { name: 'option_b', required: false, validator: () => ({ isValid: true }) },
  { name: 'option_c', required: false, validator: () => ({ isValid: true }) },
  { name: 'option_d', required: false, validator: () => ({ isValid: true }) },
  { name: 'option_e', required: false, validator: () => ({ isValid: true }) },
  { name: 'option_f', required: false, validator: () => ({ isValid: true }) },
  { name: 'correct_options', required: true, validator: validators.correctOptions },
  { name: 'time_limit', required: false, validator: validators.timeLimit },
  { name: 'base_points', required: false, validator: validators.basePoints },
  { name: 'speed_bonus_enabled', required: false, validator: validators.boolean },
  { name: 'speed_bonus_multiplier', required: false, validator: validators.speedBonusMultiplier },
  { name: 'shuffle_options', required: false, validator: validators.boolean },
  { name: 'explanation', required: false, validator: () => ({ isValid: true }) },
  { name: 'image_url', required: false, validator: validators.url },
];

/**
 * Parse a boolean string value
 */
function parseBoolean(value: string, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const lower = value.toLowerCase();
  return ['true', '1', 'yes'].includes(lower);
}

/**
 * Generate a unique option ID
 */
function generateOptionId(): string {
  return `opt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Convert a CSV row to QuestionFormData
 */
function rowToQuestionData(
  row: Record<string, string>,
  rowNumber: number
): ParsedQuestion {
  const errors: { column: string; message: string }[] = [];

  // Validate all columns
  for (const column of CSV_COLUMNS) {
    const value = row[column.name] || '';
    const result = column.validator(value);
    if (!result.isValid && result.error) {
      if (column.required || value) {
        errors.push({ column: column.name, message: result.error });
      }
    }
  }

  // Parse question type
  const questionType = (row.question_type?.toUpperCase() || 'MULTIPLE_CHOICE') as CSVQuestionType;

  // Parse options
  const optionLetters = ['a', 'b', 'c', 'd', 'e', 'f'];
  const correctOptionsStr = row.correct_options || '';
  const correctOptions = correctOptionsStr.split(';').map(o => o.trim().toUpperCase());

  // Determine if this is multi-select based on correct_options
  const actualQuestionType = correctOptions.length > 1 ? 'MULTI_SELECT' : questionType;

  const options = optionLetters
    .map((letter, index) => {
      const text = row[`option_${letter}`] || '';
      if (!text && questionType !== 'TRUE_FALSE') return null;
      return {
        id: generateOptionId(),
        optionText: text || (questionType === 'TRUE_FALSE' ? (index === 0 ? 'True' : 'False') : ''),
        isCorrect: correctOptions.includes(letter.toUpperCase()),
      };
    })
    .filter((opt): opt is NonNullable<typeof opt> => opt !== null && opt.optionText !== '');

  // For TRUE_FALSE, ensure we have True/False options
  if (questionType === 'TRUE_FALSE' && options.length === 0) {
    options.push(
      { id: generateOptionId(), optionText: 'True', isCorrect: correctOptions.includes('A') },
      { id: generateOptionId(), optionText: 'False', isCorrect: correctOptions.includes('B') }
    );
  }

  // Validate we have at least 2 options for non-number/open-ended questions
  if (options.length < 2 && !['NUMBER_INPUT', 'OPEN_ENDED'].includes(actualQuestionType)) {
    errors.push({ column: 'options', message: 'At least 2 options are required' });
  }

  // Validate at least one correct option
  if (!options.some(o => o.isCorrect)) {
    errors.push({ column: 'correct_options', message: 'At least one option must be marked as correct' });
  }

  const data: Partial<QuestionFormData> = {
    questionText: row.question_text || '',
    questionType: actualQuestionType,
    questionImageUrl: row.image_url || undefined,
    timeLimit: parseInt(row.time_limit, 10) || 30,
    options,
    scoring: {
      basePoints: parseInt(row.base_points, 10) || 1000,
      speedBonusEnabled: parseBoolean(row.speed_bonus_enabled, true),
      speedBonusMultiplier: parseFloat(row.speed_bonus_multiplier) || 0.5,
      partialCreditEnabled: actualQuestionType === 'MULTI_SELECT',
    },
    shuffleOptions: parseBoolean(row.shuffle_options, true),
    explanationText: row.explanation || undefined,
    speakerNotes: '',
  };

  return {
    rowNumber,
    data,
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Parse CSV content into questions
 */
export function parseCSV(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const questions: ParsedQuestion[] = [];

  // Find header row (skip comment lines)
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return { questions: [], totalRows: 0, validRows: 0, invalidRows: 0 };
  }

  // Parse header
  const headers = parseCSVLine(lines[headerIndex]).map(h => h.toLowerCase().trim());

  // Parse data rows
  let rowNumber = 1;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    const parsed = rowToQuestionData(row, rowNumber);
    questions.push(parsed);
    rowNumber++;
  }

  return {
    questions,
    totalRows: questions.length,
    validRows: questions.filter(q => q.isValid).length,
    invalidRows: questions.filter(q => !q.isValid).length,
  };
}

/**
 * Generate CSV template with example data and documentation
 */
export function generateTemplate(): string {
  const template = `# CTX Quiz Question Import Template
# Lines starting with # are comments and will be ignored
#
# REQUIRED COLUMNS:
#   question_text    - The question text (can include basic HTML)
#   question_type    - MULTIPLE_CHOICE, MULTI_SELECT, TRUE_FALSE, SCALE_1_10, or NUMBER_INPUT
#   correct_options  - Correct answer(s): A, B, C, D, E, or F. Use semicolons for multiple (e.g., "A;C")
#
# OPTIONAL COLUMNS:
#   option_a through option_f - Answer options (at least 2 required for most question types)
#   time_limit              - Seconds (5-120, default: 30)
#   base_points             - Points for correct answer (100-10000, default: 1000)
#   speed_bonus_enabled     - true/false (default: true)
#   speed_bonus_multiplier  - Bonus multiplier (0.1-2.0, default: 0.5)
#   shuffle_options         - Randomize option order (true/false, default: true)
#   explanation             - Explanation shown after answer reveal
#   image_url               - URL to question image
#
# TIPS:
#   - For MULTI_SELECT questions, separate correct options with semicolons: "A;C;D"
#   - For TRUE_FALSE, use A for True and B for False
#   - Wrap text containing commas in double quotes: "Hello, World"
#   - To include a quote in text, use two quotes: "He said ""Hello"""
#
question_text,question_type,option_a,option_b,option_c,option_d,correct_options,time_limit,base_points,speed_bonus_enabled,speed_bonus_multiplier,shuffle_options,explanation,image_url
"What is 2 + 2?",MULTIPLE_CHOICE,3,4,5,6,B,30,1000,true,0.5,true,"Basic arithmetic - the answer is 4",
"Select all prime numbers from the list",MULTI_SELECT,2,4,5,9,A;C,45,1500,true,0.5,false,"2 and 5 are prime numbers",
"The Earth is flat",TRUE_FALSE,True,False,,,B,20,500,false,,true,"The Earth is approximately spherical",
"What is the capital of France?",MULTIPLE_CHOICE,London,Paris,Berlin,Madrid,B,25,1000,true,0.5,true,"Paris is the capital of France",
`;

  return template;
}

/**
 * Trigger browser download of the CSV template
 */
export function downloadTemplate(): void {
  const template = generateTemplate();
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quiz_questions_template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert ParsedQuestion array to QuestionFormData array (only valid questions)
 */
export function getValidQuestions(parsed: ParsedQuestion[]): QuestionFormData[] {
  return parsed
    .filter(p => p.isValid)
    .map(p => p.data as QuestionFormData);
}
