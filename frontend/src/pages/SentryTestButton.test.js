// SentryTestButton.test.js - Test for Sentry test button component
// This test verifies that the SentryTestButton component behaves correctly
// in both development and production modes

/* eslint-env node */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
const runSentryTestButtonTests = () => {
    console.log('🧪 Testing SentryTestButton Component...\n');

    // Test 1: Verify component exists in Settings.jsx
    test('SentryTestButton component is defined in Settings.jsx', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('const SentryTestButton = ()'), 
            'SentryTestButton component should be defined');
        assert(settingsContent.includes('import * as Sentry from \'@sentry/react\''), 
            'Sentry should be imported');
    });

    // Test 2: Verify component is rendered in Settings
    test('SentryTestButton is rendered in Settings page', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('<SentryTestButton />'), 
            'SentryTestButton should be rendered in Settings component');
    });

    // Test 3: Verify DEV mode check exists
    test('Component checks for DEV mode', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('import.meta.env.DEV'), 
            'Component should check for DEV environment');
        assert(settingsContent.includes('return null'), 
            'Component should return null when not in DEV mode');
    });

    // Test 4: Verify error generation logic
    test('Component generates Sentry test error', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('Sentry Test Error'), 
            'Should create error with "Sentry Test Error" message');
        assert(settingsContent.includes('new Date().toISOString()'), 
            'Should append timestamp to error message');
        assert(settingsContent.includes('Sentry.captureException'), 
            'Should call Sentry.captureException');
    });

    // Test 5: Verify alert confirmation
    test('Component shows alert after sending error', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('alert('), 
            'Should show alert after error is sent');
        assert(settingsContent.includes('Test error sent to Sentry'), 
            'Alert should confirm error was sent to Sentry');
        assert(settingsContent.includes('Check your Sentry dashboard'), 
            'Alert should instruct user to check dashboard');
    });

    // Test 6: Verify styling matches specifications
    test('Component has correct styling', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        // Container styling
        assert(settingsContent.includes('2px dashed #ff6b6b'), 
            'Container should have dashed red border');
        assert(settingsContent.includes('#fff5f5'), 
            'Container should have light red background');
        assert(settingsContent.includes('borderRadius: \'8px\''), 
            'Container should have rounded corners');
        assert(settingsContent.includes('padding: \'1rem\''), 
            'Container should have padding');
        assert(settingsContent.includes('marginTop: \'2rem\''), 
            'Container should have top margin');
        
        // Button styling
        assert(settingsContent.includes('backgroundColor: \'#ff6b6b\''), 
            'Button should have red background');
        assert(settingsContent.includes('color: \'white\''), 
            'Button should have white text');
        assert(settingsContent.includes('fontWeight: \'bold\''), 
            'Button should have bold font');
    });

    // Test 7: Verify developer tools heading
    test('Component has developer tools heading', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('🐛 Developer Tools'), 
            'Should have "🐛 Developer Tools" heading');
        assert(settingsContent.includes('#c92a2a'), 
            'Heading should be in red color');
    });

    // Test 8: Verify description text
    test('Component has description about dev mode visibility', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('This section is only visible in development mode'), 
            'Should have description about dev mode visibility');
        assert(settingsContent.includes('#666'), 
            'Description should be in gray color');
    });

    // Test 9: Verify hover effects
    test('Button has hover effects', () => {
        const settingsPath = join(__dirname, 'Settings.jsx');
        const settingsContent = readFileSync(settingsPath, 'utf8');
        
        assert(settingsContent.includes('onMouseEnter'), 
            'Button should have onMouseEnter handler');
        assert(settingsContent.includes('onMouseLeave'), 
            'Button should have onMouseLeave handler');
        assert(settingsContent.includes('#fa5252'), 
            'Hover should change to darker red');
    });

    console.log('\n✅ All SentryTestButton tests passed!\n');
};

// Run tests if this file is executed directly
if (typeof process !== 'undefined' && process.argv[1] === new URL(import.meta.url).pathname) {
    runSentryTestButtonTests();
}

export { runSentryTestButtonTests };
