import Dashboard from './Dashboard';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockUser, mockDashboardData, mockTransactions } from '../stories/mockData';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Mock AuthContext
const MockAuthProvider = ({ children }) => {
  return children;
};

// Mock useAuth hook by creating a context wrapper
const MockAuthContext = ({ children }) => {
  const mockAuthValue = {
    currentUser: mockUser,
  };

  return children;
};

export default {
  title: 'Pages/Dashboard',
  component: Dashboard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MockAuthContext>
            <Story />
          </MockAuthContext>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Dashboard page displays an overview of the user\'s financial status. Note: This story shows the layout but may not display live data without proper Firebase mocking.',
      },
    },
  },
};

export const Default = {};

export const Mobile = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export const Loading = {
  parameters: {
    docs: {
      description: {
        story: 'Dashboard in loading state while fetching data.',
      },
    },
  },
};
