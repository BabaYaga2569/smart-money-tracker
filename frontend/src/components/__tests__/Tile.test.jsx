import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Tile from '../Tile';

// Wrapper for components that use React Router
const RouterWrapper = ({ children }) => <BrowserRouter>{children}</BrowserRouter>;

describe('Tile Component', () => {
  it('renders title correctly', () => {
    render(
      <RouterWrapper>
        <Tile title="Test Tile" link="/test">
          <p>Test content</p>
        </Tile>
      </RouterWrapper>
    );

    expect(screen.getByText('Test Tile')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <RouterWrapper>
        <Tile title="Test Tile" link="/test">
          <p>Test content</p>
        </Tile>
      </RouterWrapper>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders View All link with correct href', () => {
    render(
      <RouterWrapper>
        <Tile title="Test Tile" link="/test">
          <p>Test content</p>
        </Tile>
      </RouterWrapper>
    );

    const link = screen.getByText('View All');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/test');
  });

  it('renders with expected structure', () => {
    const { container } = render(
      <RouterWrapper>
        <Tile title="Test Tile" link="/test">
          <p>Test content</p>
        </Tile>
      </RouterWrapper>
    );

    // Just verify the tile structure exists
    const tileDiv = container.querySelector('div[style*="background"]');
    expect(tileDiv).toBeInTheDocument();
  });
});
