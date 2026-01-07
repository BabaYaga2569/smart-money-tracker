import { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

const Debug = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [schemaCheck, setSchemaCheck] = useState(null);

  const testLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUserId(userCredential.user.uid);
      setStatus(`✅ Login successful! User ID: ${userCredential.user.uid}`);
    } catch (error) {
      setStatus(`❌ Login failed: ${error.message}`);
    }
  };

  const checkSchema = async () => {
    if (!userId) {
      setStatus('❌ Please log in first or enter User ID');
      return;
    }

    try {
      const settingsRef = doc(db, 'users', userId, 'settings', 'personal');
      const snap = await getDoc(settingsRef);

      if (snap.exists()) {
        const data = snap.data();
        const issues = [];

        // Check required fields
        if (data.isOnboardingComplete === undefined) {
          issues.push('Missing field: isOnboardingComplete');
        }

        setSchemaCheck({
          exists: true,
          fields: Object.keys(data),
          issues: issues,
          data: data
        });

        setStatus(issues.length > 0 
          ? `⚠️ Found ${issues.length} schema issue(s)` 
          : '✅ Schema is valid'
        );
      } else {
        setSchemaCheck({
          exists: false,
          fields: [],
          issues: ['Settings document does not exist'],
          data: null
        });
        setStatus('❌ Settings document does not exist');
      }
    } catch (error) {
      setStatus(`❌ Schema check failed: ${error.message}`);
    }
  };

  const fixOnboarding = async () => {
    if (!userId) {
      setStatus('❌ Please log in first');
      return;
    }

    try {
      const settingsRef = doc(db, 'users', userId, 'settings', 'personal');
      await updateDoc(settingsRef, {
        isOnboardingComplete: true
      });
      setStatus('✅ Added isOnboardingComplete field!');
      // Re-check schema to confirm fix
      setTimeout(() => checkSchema(), 500);
    } catch (error) {
      setStatus(`❌ Fix failed: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', color: 'white', fontFamily: 'Arial, sans-serif' }}>
      <h1>🔧 Debug Panel</h1>
      <p style={{ marginBottom: '30px' }}>Emergency diagnostic tools - no authentication required</p>

      <hr style={{ borderColor: '#444', margin: '20px 0' }} />

      <h2>🔐 Login Test</h2>
      <input 
        type="email" 
        placeholder="Email" 
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: '10px', marginBottom: '10px', fontSize: '14px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: 'white' }}
      />
      <input 
        type="password" 
        placeholder="Password" 
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: '10px', marginBottom: '10px', fontSize: '14px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: 'white' }}
      />
      <button 
        onClick={testLogin} 
        style={{ padding: '10px 20px', fontSize: '14px', cursor: 'pointer', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
      >
        🔓 Test Login
      </button>

      <hr style={{ borderColor: '#444', margin: '20px 0' }} />

      <h2>📋 Schema Validator</h2>
      <input 
        type="text" 
        placeholder="User ID (auto-filled after login)" 
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        style={{ width: '100%', padding: '10px', marginBottom: '10px', fontSize: '14px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: 'white' }}
      />
      <button 
        onClick={checkSchema} 
        style={{ padding: '10px 20px', fontSize: '14px', cursor: 'pointer', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', marginRight: '10px' }}
      >
        🔍 Check Schema
      </button>
      <button 
        onClick={fixOnboarding} 
        style={{ padding: '10px 20px', fontSize: '14px', cursor: 'pointer', background: '#FF9800', color: 'white', border: 'none', borderRadius: '4px' }}
      >
        ✅ Fix isOnboardingComplete
      </button>

      {schemaCheck && (
        <div style={{ marginTop: '20px', background: '#222', padding: '15px', borderRadius: '5px', border: '1px solid #444' }}>
          <h3 style={{ marginTop: '0' }}>Schema Check Results:</h3>
          <p><strong>Document exists:</strong> {schemaCheck.exists ? '✅ Yes' : '❌ No'}</p>
          <p><strong>Fields found:</strong> {schemaCheck.fields.length}</p>
          {schemaCheck.fields.length > 0 && (
            <p><strong>Field names:</strong> {schemaCheck.fields.join(', ')}</p>
          )}
          {schemaCheck.issues.length > 0 && (
            <div style={{ color: '#ff6b6b', marginTop: '10px' }}>
              <strong>⚠️ Issues:</strong>
              <ul style={{ marginTop: '5px' }}>
                {schemaCheck.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {schemaCheck.data && (
            <details style={{ marginTop: '15px' }}>
              <summary style={{ cursor: 'pointer', color: '#4CAF50' }}>View Raw Data</summary>
              <pre style={{ background: '#111', padding: '10px', borderRadius: '4px', overflow: 'auto', fontSize: '12px', marginTop: '10px' }}>
                {JSON.stringify(schemaCheck.data, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      <hr style={{ borderColor: '#444', margin: '20px 0' }} />

      <h2>📊 Status</h2>
      <pre style={{ background: '#222', padding: '15px', borderRadius: '5px', border: '1px solid #444', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        {status || 'Ready'}
      </pre>

      <hr style={{ borderColor: '#444', margin: '20px 0' }} />

      <h2>🚀 Emergency Access</h2>
      <p style={{ marginBottom: '10px' }}>Use this button to bypass onboarding checks and access the dashboard directly:</p>
      <a href="/dashboard?skip_onboarding=true" style={{ textDecoration: 'none' }}>
        <button style={{ padding: '12px 24px', fontSize: '14px', cursor: 'pointer', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}>
          ⚠️ Bypass Onboarding & Go to Dashboard
        </button>
      </a>
    </div>
  );
};

export default Debug;
