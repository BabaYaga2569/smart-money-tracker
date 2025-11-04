// StringUtils.test.js - Tests for string manipulation utilities

import { 
  levenshteinDistance, 
  normalizeString, 
  calculateSimilarity, 
  containsString,
  extractSignificantWords 
} from './StringUtils.js';

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

// Test helper function
const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.message);
    process.exit(1);
  }
};

// Run tests
const runStringUtilsTests = () => {
  console.log('🧪 Testing StringUtils...\n');

  // Levenshtein Distance Tests
  test('levenshteinDistance: identical strings return 0', () => {
    const result = levenshteinDistance('hello', 'hello');
    assert(result === 0, `Expected 0, got ${result}`);
  });

  test('levenshteinDistance: case insensitive', () => {
    const result = levenshteinDistance('GOOGLE', 'google');
    assert(result === 0, `Expected 0 for case insensitive match, got ${result}`);
  });

  test('levenshteinDistance: single character difference', () => {
    const result = levenshteinDistance('hello', 'hallo');
    assert(result === 1, `Expected 1, got ${result}`);
  });

  test('levenshteinDistance: handles empty strings', () => {
    const result = levenshteinDistance('', 'hello');
    assert(result === 5, `Expected 5, got ${result}`);
  });

  // Normalize String Tests
  test('normalizeString: converts to lowercase', () => {
    const result = normalizeString('GOOGLE ONE');
    assert(result === 'google one', `Expected 'google one', got '${result}'`);
  });

  test('normalizeString: removes special characters', () => {
    const result = normalizeString('GOOGLE*ONE');
    assert(result === 'googleone', `Expected 'googleone', got '${result}'`);
  });

  test('normalizeString: normalizes whitespace', () => {
    const result = normalizeString('  Google   One  ');
    assert(result === 'google one', `Expected 'google one', got '${result}'`);
  });

  test('normalizeString: handles null/undefined', () => {
    const result = normalizeString(null);
    assert(result === '', `Expected empty string, got '${result}'`);
  });

  // Calculate Similarity Tests
  test('calculateSimilarity: identical strings return 1', () => {
    const result = calculateSimilarity('Google One', 'GOOGLE ONE');
    assert(result === 1, `Expected 1, got ${result}`);
  });

  test('calculateSimilarity: similar strings return high score', () => {
    const result = calculateSimilarity('GOOGLE*ONE', 'Google One');
    assert(result >= 0.7, `Expected >= 0.7, got ${result}`);
  });

  test('calculateSimilarity: completely different strings return low score', () => {
    const result = calculateSimilarity('Netflix', 'Amazon Prime');
    assert(result < 0.5, `Expected < 0.5, got ${result}`);
  });

  test('calculateSimilarity: handles empty strings', () => {
    const result = calculateSimilarity('', 'hello');
    assert(result === 0, `Expected 0, got ${result}`);
  });

  // Contains String Tests
  test('containsString: finds substring', () => {
    const result = containsString('GOOGLE*STORAGE', 'google');
    assert(result === true, `Expected true, got ${result}`);
  });

  test('containsString: case insensitive', () => {
    const result = containsString('Netflix Subscription', 'NETFLIX');
    assert(result === true, `Expected true, got ${result}`);
  });

  test('containsString: returns false when not found', () => {
    const result = containsString('Netflix', 'Amazon');
    assert(result === false, `Expected false, got ${result}`);
  });

  test('containsString: handles special characters', () => {
    const result = containsString('GOOGLE*ONE', 'googleone');
    assert(result === true, `Expected true, got ${result}`);
  });

  // Extract Significant Words Tests
  test('extractSignificantWords: removes filler words', () => {
    const result = extractSignificantWords('the payment for netflix');
    assert(!result.includes('the') && !result.includes('for'), 
      `Expected no filler words, got ${result}`);
    assert(result.includes('netflix'), `Expected 'netflix', got ${result}`);
  });

  test('extractSignificantWords: removes short words', () => {
    const result = extractSignificantWords('a big payment');
    assert(!result.includes('a'), `Expected no short words, got ${result}`);
  });

  test('extractSignificantWords: handles empty string', () => {
    const result = extractSignificantWords('');
    assert(result.length === 0, `Expected empty array, got ${result}`);
  });

  test('extractSignificantWords: extracts multiple words', () => {
    const result = extractSignificantWords('Netflix Premium Subscription');
    assert(result.includes('netflix'), `Expected 'netflix', got ${result}`);
    assert(result.includes('premium'), `Expected 'premium', got ${result}`);
    assert(result.includes('subscription'), `Expected 'subscription', got ${result}`);
  });

  console.log('\n✅ All StringUtils tests passed!');
};

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runStringUtilsTests();
}

export { runStringUtilsTests };
