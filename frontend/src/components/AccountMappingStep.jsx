import React, { useState, useEffect } from 'react';
import './AccountMappingStep.css';

const AccountMappingStep = ({ 
  unmatchedItems, 
  accounts, 
  onMappingComplete,
  onBack,
  customMapping: initialCustomMapping = {} 
}) => {
  const [itemMappings, setItemMappings] = useState({});
  const [bulkAccountId, setBulkAccountId] = useState('');
  const [customMapping, setCustomMapping] = useState(initialCustomMapping);
  const [showMappingTable, setShowMappingTable] = useState(false);

  useEffect(() => {
    // Initialize mappings for unmatched items
    const initialMappings = {};
    unmatchedItems.forEach(item => {
      // Try to use custom mapping if available
      if (item.institutionName && customMapping[item.institutionName]) {
        initialMappings[item.id] = customMapping[item.institutionName];
      } else {
        initialMappings[item.id] = item.linkedAccount || '';
      }
    });
    setItemMappings(initialMappings);
  }, [unmatchedItems, customMapping]);

  const handleItemMapping = (itemId, accountId) => {
    setItemMappings(prev => ({
      ...prev,
      [itemId]: accountId
    }));
  };

  const handleBulkAssign = () => {
    if (!bulkAccountId) return;

    const newMappings = {};
    unmatchedItems.forEach(item => {
      newMappings[item.id] = bulkAccountId;
    });
    setItemMappings(prev => ({ ...prev, ...newMappings }));
  };

  const handleAddCustomMapping = (institutionName, accountId) => {
    setCustomMapping(prev => ({
      ...prev,
      [institutionName]: accountId
    }));
  };

  const handleRemoveCustomMapping = (institutionName) => {
    setCustomMapping(prev => {
      const updated = { ...prev };
      delete updated[institutionName];
      return updated;
    });
  };

  const handleContinue = () => {
    // Check if all items have mappings
    const unmapped = unmatchedItems.filter(item => !itemMappings[item.id]);
    
    if (unmapped.length > 0) {
      if (!window.confirm(`${unmapped.length} item(s) still don't have an account assigned. Continue anyway?`)) {
        return;
      }
    }

    // Apply mappings to items
    const mappedItems = unmatchedItems.map(item => ({
      ...item,
      linkedAccount: itemMappings[item.id] || '',
      accountMapped: !!itemMappings[item.id]
    }));

    onMappingComplete(mappedItems, customMapping);
  };

  const getAccountName = (accountId) => {
    const account = accounts[accountId];
    if (!account) return 'Unknown Account';
    
    const name = account.name || account.official_name || 'Account';
    const institution = account.institution ? ` - ${account.institution}` : '';
    const mask = account.mask ? ` (***${account.mask})` : '';
    
    return `${name}${institution}${mask}`;
  };

  const accountOptions = Object.entries(accounts);
  const uniqueInstitutions = [...new Set(unmatchedItems.map(item => item.institutionName).filter(Boolean))];

  return (
    <div className="account-mapping-step">
      <h3>Account Assignment ({unmatchedItems.length} items)</h3>
      <p className="step-description">
        These items need to be assigned to a Plaid account. You can assign them individually or use bulk assignment.
      </p>

      {/* Bulk Assignment Section */}
      {unmatchedItems.length > 1 && (
        <div className="bulk-assignment-section">
          <h4>Bulk Assignment</h4>
          <p>Assign all unmatched items to a default account:</p>
          <div className="bulk-controls">
            <select
              value={bulkAccountId}
              onChange={(e) => setBulkAccountId(e.target.value)}
              className="bulk-account-select"
            >
              <option value="">Select an account...</option>
              {accountOptions.map(([accountId]) => (
                <option key={accountId} value={accountId}>
                  {getAccountName(accountId)}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkAccountId}
              className="bulk-assign-btn"
            >
              Assign All
            </button>
          </div>
        </div>
      )}

      {/* Individual Item Mappings */}
      <div className="unmatched-items-list">
        <h4>Item-by-Item Assignment</h4>
        {unmatchedItems.map(item => (
          <div key={item.id} className="unmatched-item">
            <div className="item-info">
              <h5>{item.name}</h5>
              <div className="item-details">
                <span className="amount">${item.amount}</span>
                <span className="frequency">{item.frequency}</span>
                {item.institutionName && (
                  <span className="institution">
                    🏦 {item.institutionName}
                  </span>
                )}
              </div>
            </div>
            <div className="item-mapping">
              <select
                value={itemMappings[item.id] || ''}
                onChange={(e) => handleItemMapping(item.id, e.target.value)}
                className="account-select"
              >
                <option value="">Select account...</option>
                {accountOptions.map(([accountId]) => (
                  <option key={accountId} value={accountId}>
                    {getAccountName(accountId)}
                  </option>
                ))}
              </select>
              {item.institutionName && itemMappings[item.id] && (
                <button
                  onClick={() => handleAddCustomMapping(item.institutionName, itemMappings[item.id])}
                  className="save-mapping-btn"
                  title="Save this mapping for future imports"
                >
                  💾
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Custom Mapping Table */}
      {uniqueInstitutions.length > 0 && (
        <div className="custom-mapping-section">
          <button
            onClick={() => setShowMappingTable(!showMappingTable)}
            className="toggle-mapping-btn"
          >
            {showMappingTable ? '▼' : '▶'} Institution Mapping Table ({Object.keys(customMapping).length})
          </button>
          
          {showMappingTable && (
            <div className="mapping-table">
              <p className="mapping-description">
                Save institution-to-account mappings for faster imports in the future.
              </p>
              
              {Object.keys(customMapping).length === 0 ? (
                <div className="no-mappings">
                  No saved mappings yet. Use the 💾 button next to each item to save a mapping.
                </div>
              ) : (
                <table className="mappings-table">
                  <thead>
                    <tr>
                      <th>Institution Name</th>
                      <th>Mapped Account</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(customMapping).map(([institution, accountId]) => (
                      <tr key={institution}>
                        <td>{institution}</td>
                        <td>{getAccountName(accountId)}</td>
                        <td>
                          <button
                            onClick={() => handleRemoveCustomMapping(institution)}
                            className="remove-mapping-btn"
                            title="Remove this mapping"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mapping-actions">
        <button onClick={onBack} className="back-btn">
          ← Back to Preview
        </button>
        <button 
          onClick={handleContinue}
          className="continue-btn"
        >
          Continue to Import →
        </button>
      </div>
    </div>
  );
};

export default AccountMappingStep;
