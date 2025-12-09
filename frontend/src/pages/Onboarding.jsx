import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import './Onboarding.css';

const Onboarding = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Personal Info
  const [personalInfo, setPersonalInfo] = useState({
    name: '',
    spouseName: ''
  });

  // Step 2: Pay Schedule
  const [paySchedule, setPaySchedule] = useState({
    frequency: 'biweekly',
    dayOfWeek: 5, // Friday
    dayOfMonth: 1,
    amount: '',
    hasSpouse: false,
    spouseFrequency: 'biweekly',
    spouseDayOfWeek: 5,
    spouseDayOfMonth: 1,
    spouseAmount: ''
  });

  const totalSteps = 5;

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep(currentStep + 1);
      setError('');
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    setError('');
  };

  const handleSkip = () => {
    if (currentStep === 3 || currentStep === 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const validateCurrentStep = () => {
    switch (currentStep) {
      case 1:
        if (!personalInfo.name.trim()) {
          setError('Please enter your name');
          return false;
        }
        return true;
      case 2:
        if (!paySchedule.amount || parseFloat(paySchedule.amount) <= 0) {
          setError('Please enter a valid pay amount');
          return false;
        }
        if (paySchedule.hasSpouse && (!paySchedule.spouseAmount || parseFloat(paySchedule.spouseAmount) <= 0)) {
          setError('Please enter a valid spouse pay amount');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const completeOnboarding = async () => {
    try {
      setLoading(true);
      setError('');

      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      
      // Get existing data (if any)
      const existingDoc = await getDoc(settingsDocRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};

      // Build pay schedules based on user input
      const paySchedules = {
        yours: {
          type: paySchedule.frequency === 'biweekly' ? 'bi-weekly' : 
                paySchedule.frequency === 'weekly' ? 'weekly' : 
                paySchedule.frequency === 'monthly' ? 'monthly' : 'bi-weekly',
          amount: paySchedule.amount,
          lastPaydate: '',
          bankSplit: {
            fixedAmount: { bank: 'SoFi', amount: '' },
            remainder: { bank: 'Bank of America' }
          }
        },
        spouse: paySchedule.hasSpouse ? {
          type: paySchedule.spouseFrequency === 'biweekly' ? 'bi-weekly' : 
                paySchedule.spouseFrequency === 'weekly' ? 'weekly' : 
                paySchedule.spouseFrequency === 'monthly' ? 'monthly' : 'bi-weekly',
          amount: paySchedule.spouseAmount,
          dates: [15, 30]
        } : {
          type: 'bi-monthly',
          amount: '',
          dates: [15, 30]
        }
      };

      // Prepare complete settings
      const settingsData = {
        ...existingData,
        personalInfo: {
          name: personalInfo.name,
          yourName: personalInfo.name,
          spouseName: personalInfo.spouseName || ''
        },
        paySchedules,
        payAmount: paySchedule.amount,
        spousePayAmount: paySchedule.hasSpouse ? paySchedule.spouseAmount : 0,
        preferences: {
          warningDays: 3,
          safetyBuffer: 200,
          weeklyEssentials: 300,
          billSortOrder: 'dueDate',
          urgentDays: 7,
          dueDateAlerts: true,
          debugMode: false
        },
        bills: existingData.bills || [],
        recurringItems: existingData.recurringItems || [],
        plaidAccounts: existingData.plaidAccounts || [],
        bankAccounts: {
          bofa: { name: 'Bank of America', type: 'Checking', balance: '' },
          sofi: { name: 'SoFi', type: 'Savings', balance: '' },
          usaa: { name: 'USAA', type: 'Checking', balance: '' },
          cap1: { name: 'Capital One', type: 'Credit', balance: '' }
        },
        lastPayDate: null,
        nextPaydayOverride: null,
        isOnboardingComplete: true,
        lastUpdated: new Date().toISOString()
      };

      await setDoc(settingsDocRef, settingsData);
      
      // Navigate to dashboard
      navigate('/');
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="onboarding-step">
            <h2>👋 Welcome to Smart Money Tracker!</h2>
            <p className="step-description">
              Let's get you set up in just a few minutes. First, tell us a bit about yourself.
            </p>
            
            <div className="form-group">
              <label htmlFor="name">Your Name *</label>
              <input
                id="name"
                type="text"
                value={personalInfo.name}
                onChange={(e) => setPersonalInfo({ ...personalInfo, name: e.target.value })}
                placeholder="Enter your name"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="spouseName">Spouse/Partner Name (Optional)</label>
              <input
                id="spouseName"
                type="text"
                value={personalInfo.spouseName}
                onChange={(e) => setPersonalInfo({ ...personalInfo, spouseName: e.target.value })}
                placeholder="Leave blank if not applicable"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="onboarding-step">
            <h2>💰 Set Up Your Pay Schedule</h2>
            <p className="step-description">
              Help us calculate when you get paid so we can track your spending better.
            </p>

            <div className="form-group">
              <label htmlFor="frequency">How often do you get paid? *</label>
              <select
                id="frequency"
                value={paySchedule.frequency}
                onChange={(e) => setPaySchedule({ ...paySchedule, frequency: e.target.value })}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
                <option value="semimonthly">Semi-monthly (15th & 30th)</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {(paySchedule.frequency === 'weekly' || paySchedule.frequency === 'biweekly') && (
              <div className="form-group">
                <label htmlFor="dayOfWeek">What day of the week?</label>
                <select
                  id="dayOfWeek"
                  value={paySchedule.dayOfWeek}
                  onChange={(e) => setPaySchedule({ ...paySchedule, dayOfWeek: parseInt(e.target.value) })}
                >
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                </select>
              </div>
            )}

            {(paySchedule.frequency === 'monthly') && (
              <div className="form-group">
                <label htmlFor="dayOfMonth">What day of the month?</label>
                <input
                  id="dayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  value={paySchedule.dayOfMonth}
                  onChange={(e) => setPaySchedule({ ...paySchedule, dayOfMonth: parseInt(e.target.value) })}
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="amount">Typical pay amount (after taxes) *</label>
              <input
                id="amount"
                type="number"
                step="0.01"
                value={paySchedule.amount}
                onChange={(e) => setPaySchedule({ ...paySchedule, amount: e.target.value })}
                placeholder="e.g., 1883.81"
              />
            </div>

            {personalInfo.spouseName && (
              <>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={paySchedule.hasSpouse}
                      onChange={(e) => setPaySchedule({ ...paySchedule, hasSpouse: e.target.checked })}
                    />
                    <span style={{ marginLeft: '8px' }}>Add {personalInfo.spouseName}'s pay schedule</span>
                  </label>
                </div>

                {paySchedule.hasSpouse && (
                  <>
                    <div className="form-group">
                      <label htmlFor="spouseFrequency">How often does {personalInfo.spouseName} get paid?</label>
                      <select
                        id="spouseFrequency"
                        value={paySchedule.spouseFrequency}
                        onChange={(e) => setPaySchedule({ ...paySchedule, spouseFrequency: e.target.value })}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
                        <option value="semimonthly">Semi-monthly (15th & 30th)</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="spouseAmount">{personalInfo.spouseName}'s typical pay amount *</label>
                      <input
                        id="spouseAmount"
                        type="number"
                        step="0.01"
                        value={paySchedule.spouseAmount}
                        onChange={(e) => setPaySchedule({ ...paySchedule, spouseAmount: e.target.value })}
                        placeholder="e.g., 1851.04"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        );

      case 3:
        return (
          <div className="onboarding-step">
            <h2>🏦 Connect Your Bank (Optional)</h2>
            <p className="step-description">
              Connect your bank account to automatically track transactions and balances. 
              This is powered by Plaid, a secure banking integration service.
            </p>

            <div className="benefits-list">
              <h3>Benefits of connecting:</h3>
              <ul>
                <li>✅ Automatic transaction tracking</li>
                <li>✅ Real-time balance updates</li>
                <li>✅ Automatic bill detection</li>
                <li>✅ Spending insights</li>
              </ul>
            </div>

            <div className="info-box">
              <p><strong>Note:</strong> You can also add bank accounts manually in Settings later.</p>
            </div>

            <button className="btn-secondary" disabled>
              🔒 Connect Bank (Coming Soon)
            </button>
          </div>
        );

      case 4:
        return (
          <div className="onboarding-step">
            <h2>📋 Add Your First Bills (Optional)</h2>
            <p className="step-description">
              Add your recurring bills to help track spending. You can always add more later.
            </p>

            <div className="common-bills">
              <h3>Common bills to add:</h3>
              <ul>
                <li>🏠 Rent/Mortgage</li>
                <li>⚡ Utilities (Electric, Gas, Water)</li>
                <li>📱 Phone & Internet</li>
                <li>🚗 Car Payment & Insurance</li>
                <li>💳 Credit Card Payments</li>
              </ul>
            </div>

            <div className="info-box">
              <p><strong>Tip:</strong> You can add bills in the Settings or Recurring pages after setup.</p>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="onboarding-step completion-step">
            <h2>🎉 You're All Set!</h2>
            <p className="step-description">
              Welcome to Smart Money Tracker! Here's what you can do now:
            </p>

            <div className="tips-list">
              <div className="tip-item">
                <h3>📊 Dashboard</h3>
                <p>View your financial overview at a glance</p>
              </div>
              
              <div className="tip-item">
                <h3>💵 Spendability</h3>
                <p>See how much you can safely spend before your next payday</p>
              </div>
              
              <div className="tip-item">
                <h3>🔄 Recurring Bills</h3>
                <p>Manage all your recurring expenses in one place</p>
              </div>
              
              <div className="tip-item">
                <h3>⚙️ Settings</h3>
                <p>Fine-tune your preferences and add more details</p>
              </div>
            </div>

            <div className="completion-message">
              <p>💡 <strong>Pro Tip:</strong> Visit Settings to add your last pay date for accurate calculations!</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        {/* Progress Indicator */}
        <div className="progress-indicator">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
          <p className="progress-text">Step {currentStep} of {totalSteps}</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Step Content */}
        {renderStep()}

        {/* Navigation Buttons */}
        <div className="onboarding-nav">
          {currentStep > 1 && (
            <button 
              className="btn-secondary" 
              onClick={handleBack}
              disabled={loading}
            >
              ← Back
            </button>
          )}

          <div className="nav-right">
            {(currentStep === 3 || currentStep === 4) && (
              <button 
                className="btn-secondary" 
                onClick={handleSkip}
                disabled={loading}
              >
                Skip
              </button>
            )}

            {currentStep < totalSteps ? (
              <button 
                className="btn-primary" 
                onClick={handleNext}
                disabled={loading}
              >
                Next →
              </button>
            ) : (
              <button 
                className="btn-primary btn-complete" 
                onClick={completeOnboarding}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Go to Dashboard 🚀'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
