// safeAccess.test.js - Tests for Safe Data Access Utilities

// Simple test assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
};

// Import the utilities
import {
  safeGet,
  safeNumber,
  safeCurrency,
  safeArray,
  safeString,
  hasValue,
  safeTry
} from './safeAccess.js';

// Run tests
console.log('='.repeat(70));
console.log('Safe Data Access Utilities Tests');
console.log('='.repeat(70));
console.log();

let passedTests = 0;
let totalTests = 0;

// Test 1: safeGet with valid nested object
totalTests++;
if (test('safeGet: Should get nested property', () => {
  const obj = { user: { address: { city: 'New York' } } };
  const result = safeGet(obj, 'user.address.city', 'Unknown');
  assert(result === 'New York', 'Should return nested property value');
})) passedTests++;

// Test 2: safeGet with missing property
totalTests++;
if (test('safeGet: Should return default for missing property', () => {
  const obj = { user: { name: 'John' } };
  const result = safeGet(obj, 'user.address.city', 'Unknown');
  assert(result === 'Unknown', 'Should return default value');
})) passedTests++;

// Test 3: safeGet with null object
totalTests++;
if (test('safeGet: Should handle null object', () => {
  const result = safeGet(null, 'user.name', 'Default');
  assert(result === 'Default', 'Should return default for null object');
})) passedTests++;

// Test 4: safeGet with undefined object
totalTests++;
if (test('safeGet: Should handle undefined object', () => {
  const result = safeGet(undefined, 'user.name', 'Default');
  assert(result === 'Default', 'Should return default for undefined object');
})) passedTests++;

// Test 5: safeNumber with valid number
totalTests++;
if (test('safeNumber: Should parse valid number', () => {
  const result = safeNumber('123', 0);
  assert(result === 123, 'Should parse string to number');
})) passedTests++;

// Test 6: safeNumber with invalid value
totalTests++;
if (test('safeNumber: Should return fallback for invalid value', () => {
  const result = safeNumber('abc', 0);
  assert(result === 0, 'Should return fallback for NaN');
})) passedTests++;

// Test 7: safeNumber with null
totalTests++;
if (test('safeNumber: Should handle null', () => {
  const result = safeNumber(null, 10);
  assert(result === 10, 'Should return fallback for null');
})) passedTests++;

// Test 8: safeCurrency with valid number
totalTests++;
if (test('safeCurrency: Should format valid number', () => {
  const result = safeCurrency(100);
  assert(result === '$100.00', 'Should format as currency');
})) passedTests++;

// Test 9: safeCurrency with invalid value
totalTests++;
if (test('safeCurrency: Should handle invalid value', () => {
  const result = safeCurrency(null, '$0.00');
  assert(result === '$0.00', 'Should return fallback for invalid value');
})) passedTests++;

// Test 10: safeArray with valid array
totalTests++;
if (test('safeArray: Should return array unchanged', () => {
  const arr = [1, 2, 3];
  const result = safeArray(arr);
  assert(result === arr, 'Should return same array');
})) passedTests++;

// Test 11: safeArray with non-array
totalTests++;
if (test('safeArray: Should return fallback for non-array', () => {
  const result = safeArray('not an array', []);
  assert(Array.isArray(result) && result.length === 0, 'Should return empty array fallback');
})) passedTests++;

// Test 12: safeString with valid string
totalTests++;
if (test('safeString: Should return string unchanged', () => {
  const result = safeString('hello');
  assert(result === 'hello', 'Should return same string');
})) passedTests++;

// Test 13: safeString with non-string
totalTests++;
if (test('safeString: Should convert non-string to string', () => {
  const result = safeString(123, '');
  assert(result === '', 'Should return fallback string');
})) passedTests++;

// Test 14: hasValue with valid string
totalTests++;
if (test('hasValue: Should return true for non-empty string', () => {
  const result = hasValue('hello');
  assert(result === true, 'Should return true for non-empty string');
})) passedTests++;

// Test 15: hasValue with empty string
totalTests++;
if (test('hasValue: Should return false for empty string', () => {
  const result = hasValue('   ');
  assert(result === false, 'Should return false for whitespace-only string');
})) passedTests++;

// Test 16: hasValue with empty array
totalTests++;
if (test('hasValue: Should return false for empty array', () => {
  const result = hasValue([]);
  assert(result === false, 'Should return false for empty array');
})) passedTests++;

// Test 17: hasValue with null
totalTests++;
if (test('hasValue: Should return false for null', () => {
  const result = hasValue(null);
  assert(result === false, 'Should return false for null');
})) passedTests++;

// Test 18: safeTry with successful function
totalTests++;
if (test('safeTry: Should execute function successfully', () => {
  const result = safeTry(() => 1 + 1, 0);
  assert(result === 2, 'Should return function result');
})) passedTests++;

// Test 19: safeTry with failing function
totalTests++;
if (test('safeTry: Should return fallback for failing function', () => {
  const result = safeTry(() => {
    throw new Error('Test error');
  }, 'fallback');
  assert(result === 'fallback', 'Should return fallback on error');
})) passedTests++;

// Test 20: safeTry with null return
totalTests++;
if (test('safeTry: Should handle null fallback', () => {
  const result = safeTry(() => {
    throw new Error('Test error');
  });
  assert(result === null, 'Should return null as default fallback');
})) passedTests++;

console.log();
console.log('='.repeat(70));
console.log(`Test Results: ${passedTests}/${totalTests} passed`);
console.log('='.repeat(70));

// Exit with appropriate code
if (passedTests !== totalTests) {
  process.exit(1);
}
