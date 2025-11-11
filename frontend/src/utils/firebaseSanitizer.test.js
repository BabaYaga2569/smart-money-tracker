// firebaseSanitizer.test.js - Tests for Firebase data sanitization

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

// The sanitizeForFirebase function (duplicated for testing)
const sanitizeForFirebase = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirebase);
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      sanitized[key] = sanitizeForFirebase(value);
    }
  }
  return sanitized;
};

// Test Cases
console.log('\n🧪 Testing Firebase Sanitization Function\n');

let passed = 0;
let total = 0;

// Test 1: Simple object with undefined values
total++;
if (test('removes undefined values from simple object', () => {
  const input = { a: 1, b: undefined, c: 'test' };
  const result = sanitizeForFirebase(input);
  assert(result.a === 1, 'should keep defined numeric values');
  assert(result.b === undefined, 'should remove undefined values');
  assert(result.c === 'test', 'should keep defined string values');
  assert(!('b' in result), 'should not have undefined key');
})) passed++;

// Test 2: Nested object with undefined values
total++;
if (test('removes undefined values from nested objects', () => {
  const input = {
    name: 'Account',
    balance: 100,
    details: {
      available: undefined,
      current: 100,
      pending: undefined
    }
  };
  const result = sanitizeForFirebase(input);
  assert(result.name === 'Account', 'should keep top-level defined values');
  assert(result.balance === 100, 'should keep numeric values');
  assert(result.details.current === 100, 'should keep nested defined values');
  assert(!('available' in result.details), 'should remove nested undefined values');
  assert(!('pending' in result.details), 'should remove nested undefined values');
})) passed++;

// Test 3: Array of objects with undefined values
total++;
if (test('removes undefined values from array of objects', () => {
  const input = [
    { id: 1, balance: 100, extra: undefined },
    { id: 2, balance: 200, extra: 'value' }
  ];
  const result = sanitizeForFirebase(input);
  assert(Array.isArray(result), 'should return an array');
  assert(result.length === 2, 'should preserve array length');
  assert(!('extra' in result[0]), 'should remove undefined in first item');
  assert(result[1].extra === 'value', 'should keep defined values in second item');
})) passed++;

// Test 4: Null values should be preserved
total++;
if (test('preserves null values', () => {
  const input = { a: null, b: undefined, c: 'test' };
  const result = sanitizeForFirebase(input);
  assert(result.a === null, 'should preserve null values');
  assert(!('b' in result), 'should remove undefined values');
})) passed++;

// Test 5: Empty object
total++;
if (test('handles empty objects', () => {
  const input = {};
  const result = sanitizeForFirebase(input);
  assert(typeof result === 'object', 'should return an object');
  assert(Object.keys(result).length === 0, 'should return empty object');
})) passed++;

// Test 6: Credit card account-like structure
total++;
if (test('handles credit card account structure with undefined balances', () => {
  const input = {
    account_id: 'acc123',
    name: 'Credit Card',
    type: 'credit',
    balance: '1500.00',
    available: undefined,  // Credit cards may have undefined available
    current: '1500.00',
    mask: '1234',
    isPlaid: true,
    item_id: 'item456',
    institution_name: 'Bank Name'
  };
  const result = sanitizeForFirebase(input);
  assert(result.account_id === 'acc123', 'should keep account_id');
  assert(result.name === 'Credit Card', 'should keep name');
  assert(result.balance === '1500.00', 'should keep balance');
  assert(!('available' in result), 'should remove undefined available');
  assert(result.current === '1500.00', 'should keep current');
  assert(result.institution_name === 'Bank Name', 'should keep institution_name');
})) passed++;

// Test 7: Primitive values
total++;
if (test('handles primitive values correctly', () => {
  assert(sanitizeForFirebase('string') === 'string', 'should return string as-is');
  assert(sanitizeForFirebase(123) === 123, 'should return number as-is');
  assert(sanitizeForFirebase(true) === true, 'should return boolean as-is');
  assert(sanitizeForFirebase(null) === null, 'should return null as null');
  assert(sanitizeForFirebase(undefined) === null, 'should convert undefined to null');
})) passed++;

// Test 8: Deep nesting
total++;
if (test('handles deeply nested structures', () => {
  const input = {
    level1: {
      level2: {
        level3: {
          defined: 'value',
          undefined: undefined
        }
      }
    }
  };
  const result = sanitizeForFirebase(input);
  assert(result.level1.level2.level3.defined === 'value', 'should keep deeply nested defined values');
  assert(!('undefined' in result.level1.level2.level3), 'should remove deeply nested undefined values');
})) passed++;

// Test 9: Array of primitive values
total++;
if (test('handles arrays of primitive values', () => {
  const input = ['a', 'b', 'c'];
  const result = sanitizeForFirebase(input);
  assert(Array.isArray(result), 'should return an array');
  assert(result.length === 3, 'should preserve array length');
  assert(result[0] === 'a', 'should preserve array values');
})) passed++;

// Test 10: Mixed array with undefined
total++;
if (test('handles mixed arrays with objects containing undefined', () => {
  const input = [
    { a: 1, b: undefined },
    { c: 3, d: 4 }
  ];
  const result = sanitizeForFirebase(input);
  assert(!('b' in result[0]), 'should remove undefined from first object');
  assert(result[1].c === 3, 'should keep defined values in second object');
})) passed++;

console.log(`\n📊 Test Results: ${passed}/${total} tests passed\n`);

if (passed === total) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed!');
  process.exit(1);
}
