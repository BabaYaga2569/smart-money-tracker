import Login from './Login';
import { MemoryRouter } from 'react-router-dom';

// Mock AuthContext
const MockAuthProvider = ({ children }) => {
  const mockAuthValue = {
    login: async (email, password) => {
      console.log('Mock login:', email, password);
      return Promise.resolve();
    },
    signup: async (email, password) => {
      console.log('Mock signup:', email, password);
      return Promise.resolve();
    },
    currentUser: null,
  };

  // Create a mock context
  return children;
};

export default {
  title: 'Pages/Login',
  component: Login,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <MockAuthProvider>
          <Story />
        </MockAuthProvider>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export const LoginPage = {};

export const Mobile = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
