/**
 * Test file for Payment Pattern Matching
 * 
 * Run with: node backend/utils/PaymentPatternMatcher.test.js
 */

import { PaymentPatternMatcher } from './PaymentPatternMatcher.js';

const matcher = new PaymentPatternMatcher();

console.log('🧪 Testing Payment Pattern Matcher\n');
console.log('═'.repeat(70));
console.log('\n');

// Test cases for different payment types
const testCases = [
  // Zelle patterns
  {
    name: 'Zelle with confirmation and name',
    transaction: {
      merchant_name: 'Zelle Transfer CONF# P73F008MJ; RAYLENE PANDO'
    },
    expected: {
      paymentType: 'zelle',
      recipient: 'raylene pando'
    }
  },
  {
    name: 'Zelle with different format',
    transaction: {
      merchant_name: 'ZELLE PAYMENT TO JOHN SMITH CONF#ABC123'
    },
    expected: {
      paymentType: 'zelle',
      recipient: 'john smith'
    }
  },
  {
    name: 'Zelle simple format',
    transaction: {
      merchant_name: 'Zelle Transfer; LANDLORD NAME LLC'
    },
    expected: {
      paymentType: 'zelle',
      recipient: 'landlord name llc'
    }
  },
  
  // Venmo patterns
  {
    name: 'Venmo with @username',
    transaction: {
      merchant_name: 'Venmo Payment to @username'
    },
    expected: {
      paymentType: 'venmo',
      recipient: 'username'
    }
  },
  {
    name: 'Venmo with real name',
    transaction: {
      merchant_name: 'Venmo payment Jane Doe'
    },
    expected: {
      paymentType: 'venmo',
      recipient: 'jane doe'
    }
  },
  
  // CashApp patterns
  {
    name: 'CashApp with $cashtag',
    transaction: {
      merchant_name: 'Cash App to $johndoe'
    },
    expected: {
      paymentType: 'cashapp',
      recipient: 'johndoe'
    }
  },
  {
    name: 'CashApp alternative format',
    transaction: {
      merchant_name: 'CASH APP $USERNAME123'
    },
    expected: {
      paymentType: 'cashapp',
      recipient: 'username123'
    }
  },
  
  // Check patterns
  {
    name: 'Check with number and payee',
    transaction: {
      merchant_name: 'Check #1234 to ABC Property Management'
    },
    expected: {
      paymentType: 'check',
      recipient: 'abc property management'
    }
  },
  {
    name: 'Check simple format',
    transaction: {
      merchant_name: 'CHECK 5678 ELECTRIC COMPANY'
    },
    expected: {
      paymentType: 'check',
      recipient: 'electric company'
    }
  },
  
  // ACH patterns
  {
    name: 'ACH payment',
    transaction: {
      merchant_name: 'ACH PAYMENT TO UTILITY PROVIDER'
    },
    expected: {
      paymentType: 'ach',
      recipient: 'utility provider'
    }
  },
  {
    name: 'ACH transfer',
    transaction: {
      merchant_name: 'ACH TRANSFER LANDLORD LLC'
    },
    expected: {
      paymentType: 'ach',
      recipient: 'landlord llc'
    }
  },
  
  // Wire transfer patterns
  {
    name: 'Wire transfer',
    transaction: {
      merchant_name: 'Wire Transfer to International Bank'
    },
    expected: {
      paymentType: 'wire',
      recipient: 'international bank'
    }
  },
  
  // Non-P2P (should return null)
  {
    name: 'Regular merchant (should not match)',
    transaction: {
      merchant_name: 'WALMART SUPERCENTER #1234'
    },
    expected: null
  },
  {
    name: 'Gas station (should not match)',
    transaction: {
      merchant_name: 'SHELL GAS STATION'
    },
    expected: null
  }
];

// Run tests
let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`  Input: "${testCase.transaction.merchant_name}"`);
  
  const result = matcher.extractPaymentInfo(testCase.transaction);
  
  if (testCase.expected === null) {
    if (result === null) {
      console.log(`  ✅ PASS: Correctly returned null (not a P2P payment)`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected null but got result`);
      console.log(`    Got: ${JSON.stringify(result, null, 2)}`);
      failed++;
    }
  } else {
    if (result === null) {
      console.log(`  ❌ FAIL: Expected match but got null`);
      console.log(`    Expected: ${JSON.stringify(testCase.expected, null, 2)}`);
      failed++;
    } else {
      const typeMatch = result.paymentType === testCase.expected.paymentType;
      const recipientMatch = result.recipient === testCase.expected.recipient;
      
      if (typeMatch && recipientMatch) {
        console.log(`  ✅ PASS`);
        console.log(`    Type: ${result.paymentType}, Recipient: ${result.recipient}`);
        console.log(`    Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`    Keywords: ${result.keywords.join(', ')}`);
        passed++;
      } else {
        console.log(`  ❌ FAIL`);
        console.log(`    Expected: ${JSON.stringify(testCase.expected, null, 2)}`);
        console.log(`    Got: type=${result.paymentType}, recipient=${result.recipient}`);
        failed++;
      }
    }
  }
  
  console.log('');
});

// Summary
console.log('═'.repeat(70));
console.log('\n📊 Test Summary:');
console.log(`  Total: ${testCases.length}`);
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log('\n');

// Additional keyword extraction test
console.log('═'.repeat(70));
console.log('\n🔍 Testing Keyword Extraction:\n');

const keywordTest = {
  merchant_name: 'Zelle Transfer CONF# P73F008MJ; RAYLENE PANDO PROPERTY MANAGEMENT'
};

const info = matcher.extractPaymentInfo(keywordTest);
if (info) {
  console.log(`Input: "${keywordTest.merchant_name}"`);
  console.log(`Extracted Keywords: ${info.keywords.join(', ')}`);
  console.log(`Recipient: ${info.recipient}`);
  console.log('');
}

console.log('═'.repeat(70));
console.log('\n✨ Testing Complete!\n');

// Exit with proper code
process.exit(failed > 0 ? 1 : 0);
