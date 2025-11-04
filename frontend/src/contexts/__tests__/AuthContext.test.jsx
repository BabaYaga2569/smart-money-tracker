import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock Firebase modules
vi.mock('../../firebase', () => ({
  auth: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => {
    // Simulate no user initially
    callback(null);
    return vi.fn(); // unsubscribe function
  }),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../config/sentry', () => ({
  setSentryUser: vi.fn(),
}));

// Test component that uses the auth context
const TestComponent = () => {
  const { currentUser, login, signup, logout } = useAuth();
  return (
    <div>
      <div data-testid="user-status">{currentUser ? 'Logged In' : 'Logged Out'}</div>
      <button onClick={() => login('test@example.com', 'password')}>Login</button>
      <button onClick={() => signup('test@example.com', 'password')}>Signup</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides auth context to children', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-status')).toHaveTextContent('Logged Out');
    });
  });

  it('provides login function', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: '123' } });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });

    const loginButton = screen.getByText('Login');
    loginButton.click();

    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'test@example.com', 'password');
    });
  });

  it('provides signup function', async () => {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: '123' } });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Signup')).toBeInTheDocument();
    });

    const signupButton = screen.getByText('Signup');
    signupButton.click();

    await waitFor(() => {
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith({}, 'test@example.com', 'password');
    });
  });

  it('provides logout function', async () => {
    const { signOut } = await import('firebase/auth');
    signOut.mockResolvedValue();

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    const logoutButton = screen.getByText('Logout');
    logoutButton.click();

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({});
    });
  });
});
