// PlaidConnectionManager.test.js - Tests for PlaidConnectionManager
// NOTE: These tests are designed to run in a browser environment where localStorage is available.
// They can be run in the browser console or with a test runner that provides browser APIs.

import PlaidConnectionManager from './PlaidConnectionManager.js';

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

export const runPlaidConnectionManagerTests = () => {
    console.log('🧪 Testing PlaidConnectionManager\n');

    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Initial state
    totalTests++;
    if (test('Initial state should have no token and no connection', () => {
        PlaidConnectionManager.clearConnection();
        const status = PlaidConnectionManager.getStatus();
        assert(status.hasToken === false, 'hasToken should be false');
        assert(status.hasAccounts === false, 'hasAccounts should be false');
        assert(status.isApiWorking === null, 'isApiWorking should be null');
        assert(PlaidConnectionManager.isFullyConnected() === false, 'isFullyConnected should be false');
    })) {
        passedTests++;
    }

    // Test 2: Setting accounts
    totalTests++;
    if (test('Setting Plaid accounts should update hasAccounts', () => {
        PlaidConnectionManager.setPlaidAccounts([
            { account_id: '1', balance: 100 },
            { account_id: '2', balance: 200 }
        ]);
        const status = PlaidConnectionManager.getStatus();
        assert(status.hasAccounts === true, 'hasAccounts should be true after setting accounts');
    })) {
        passedTests++;
    }

    // Test 3: Setting access token
    totalTests++;
    if (test('Setting access token should update hasToken', () => {
        PlaidConnectionManager.setAccessToken('test_token');
        const status = PlaidConnectionManager.getStatus();
        assert(status.hasToken === true, 'hasToken should be true after setting token');
        assert(PlaidConnectionManager.hasAccessToken() === true, 'hasAccessToken should return true');
    })) {
        passedTests++;
    }

    // Test 4: Error messages
    totalTests++;
    if (test('Error messages should be formatted properly', () => {
        PlaidConnectionManager.clearConnection();
        PlaidConnectionManager.connectionState.error = 'Test error';
        PlaidConnectionManager.connectionState.errorType = 'cors';
        const errorMsg = PlaidConnectionManager.getErrorMessage();
        assert(errorMsg !== null, 'Error message should not be null');
        assert(errorMsg.includes('CORS'), 'CORS error should mention CORS');
    })) {
        passedTests++;
    }

    // Test 5: Troubleshooting steps
    totalTests++;
    if (test('Troubleshooting steps should be provided for errors', () => {
        PlaidConnectionManager.clearConnection();
        PlaidConnectionManager.connectionState.errorType = 'network';
        const steps = PlaidConnectionManager.getTroubleshootingSteps();
        assert(Array.isArray(steps), 'Troubleshooting steps should be an array');
        assert(steps.length > 0, 'Should provide at least one troubleshooting step');
    })) {
        passedTests++;
    }

    // Test 6: Clear connection
    totalTests++;
    if (test('Clearing connection should reset all state', () => {
        PlaidConnectionManager.setAccessToken('test_token');
        PlaidConnectionManager.setPlaidAccounts([{ account_id: '1', balance: 100 }]);
        PlaidConnectionManager.clearConnection();
        
        const status = PlaidConnectionManager.getStatus();
        assert(status.hasToken === false, 'hasToken should be false after clear');
        assert(status.hasAccounts === false, 'hasAccounts should be false after clear');
        assert(localStorage.getItem('plaid_access_token') === null, 'localStorage should be cleared');
    })) {
        passedTests++;
    }

    // Test 7: Subscribe/Unsubscribe
    totalTests++;
    if (test('Should be able to subscribe and unsubscribe from changes', () => {
        let callbackCalled = false;
        const callback = () => { callbackCalled = true; };
        
        const unsubscribe = PlaidConnectionManager.subscribe(callback);
        PlaidConnectionManager.setPlaidAccounts([{ account_id: '1', balance: 100 }]);
        
        assert(callbackCalled === true, 'Callback should be called when state changes');
        
        callbackCalled = false;
        unsubscribe();
        PlaidConnectionManager.setPlaidAccounts([]);
        
        assert(callbackCalled === false, 'Callback should not be called after unsubscribe');
    })) {
        passedTests++;
    }

    // Test 8: Empty accounts array
    totalTests++;
    if (test('Empty accounts array should set hasAccounts to false', () => {
        PlaidConnectionManager.setPlaidAccounts([]);
        const status = PlaidConnectionManager.getStatus();
        assert(status.hasAccounts === false, 'hasAccounts should be false for empty array');
    })) {
        passedTests++;
    }

    // Summary
    console.log(`\n📊 Test Summary: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('✅ All tests passed!');
        return true;
    } else {
        console.log(`❌ ${totalTests - passedTests} test(s) failed`);
        return false;
    }
};

// Run tests if this file is executed directly
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    runPlaidConnectionManagerTests();
}
