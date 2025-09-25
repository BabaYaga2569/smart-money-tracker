import React from 'react';

const Categories = () => {
  return (
    <div style={{
      padding: '20px',
      background: '#000',
      color: '#fff',
      minHeight: '100vh'
    }}>
      <div style={{
        marginBottom: '30px',
        textAlign: 'center'
      }}>
        <h2 style={{
          color: '#00ff88',
          margin: '0 0 10px 0',
          fontSize: '2rem'
        }}>🏷️ Categories</h2>
        <p style={{
          color: '#ccc',
          margin: '0'
        }}>Spending by category</p>
      </div>

      <div style={{
        background: '#1a1a1a',
        border: '2px solid #333',
        borderRadius: '12px',
        padding: '30px',
        textAlign: 'center'
      }}>
        <h3 style={{
          color: '#00ff88',
          margin: '0 0 15px 0'
        }}>🚧 Coming Soon</h3>
        <p style={{
          color: '#ccc',
          margin: '10px 0'
        }}>Category management coming after Phase 3 (Plaid Integration).</p>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '20px',
          marginTop: '20px'
        }}>
          <div style={{
            background: '#333',
            padding: '15px',
            borderRadius: '8px'
          }}>
            <h4 style={{ color: '#00ff88', margin: '0 0 5px 0' }}>12</h4>
            <p style={{ color: '#ccc', margin: '0', fontSize: '0.9rem' }}>Categories</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Categories;