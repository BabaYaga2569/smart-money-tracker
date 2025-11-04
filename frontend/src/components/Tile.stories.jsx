import Tile from './Tile';
import { MemoryRouter } from 'react-router-dom';

export default {
  title: 'Components/Tile',
  component: Tile,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  argTypes: {
    title: {
      control: 'text',
      description: 'Tile title',
    },
    link: {
      control: 'text',
      description: 'Link URL for "View All" button',
    },
    children: {
      description: 'Tile content',
    },
  },
};

export const Default = {
  args: {
    title: 'Recent Transactions',
    link: '/transactions',
    children: (
      <div>
        <p style={{ margin: '8px 0' }}>Amazon - $45.99</p>
        <p style={{ margin: '8px 0' }}>Starbucks - $5.75</p>
        <p style={{ margin: '8px 0' }}>Netflix - $15.99</p>
      </div>
    ),
  },
};

export const WithBalance = {
  args: {
    title: 'Total Balance',
    link: '/accounts',
    children: (
      <div>
        <h3 style={{ fontSize: '2rem', color: '#00ff99', margin: '16px 0' }}>$12,500.00</h3>
        <p style={{ color: '#b0b0b0', fontSize: '0.875rem' }}>Across 3 accounts</p>
      </div>
    ),
  },
};

export const WithList = {
  args: {
    title: 'Bills Due Soon',
    link: '/bills',
    children: (
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Electric Bill</span>
            <span style={{ color: '#00ff99' }}>$120.00</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#808080' }}>Due: Jan 25</div>
        </li>
        <li style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Internet</span>
            <span style={{ color: '#00ff99' }}>$79.99</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#808080' }}>Due: Jan 20</div>
        </li>
      </ul>
    ),
  },
};

export const Empty = {
  args: {
    title: 'No Data',
    link: '/dashboard',
    children: (
      <p style={{ textAlign: 'center', color: '#808080', padding: '32px 0' }}>
        No data available
      </p>
    ),
  },
};
