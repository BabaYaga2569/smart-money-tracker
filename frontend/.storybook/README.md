# Storybook

## Running Storybook

```bash
npm run storybook
```

Opens Storybook at http://localhost:6006

## Building Storybook

```bash
npm run build-storybook
```

Builds static Storybook to `storybook-static/` folder.

## Adding Stories

Create `.stories.jsx` files next to your components:

```javascript
import YourComponent from './YourComponent';

export default {
  title: 'Components/YourComponent',
  component: YourComponent,
  tags: ['autodocs'],
};

export const Default = {
  args: {
    // your props
  },
};
```

## Best Practices

- Write stories for all reusable components
- Document all props with descriptions
- Include multiple variants (states, sizes, etc.)
- Add interaction tests where appropriate
- Keep stories simple and focused
