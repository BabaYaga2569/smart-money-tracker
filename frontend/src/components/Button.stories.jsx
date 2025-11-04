import Button from './Button';

export default {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'Button text content',
    },
    onClick: {
      action: 'clicked',
      description: 'Click handler function',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    type: {
      control: 'select',
      options: ['button', 'submit', 'reset'],
      description: 'Button type attribute',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
  },
};

export const Default = {
  args: {
    children: 'Button',
  },
};

export const Primary = {
  args: {
    children: 'Primary Button',
    className: 'primary-btn',
  },
};

export const Disabled = {
  args: {
    children: 'Disabled Button',
    disabled: true,
  },
};

export const Submit = {
  args: {
    children: 'Submit',
    type: 'submit',
    className: 'submit-btn',
  },
};

export const LongText = {
  args: {
    children: 'This is a button with very long text content',
  },
};
