import Input from './Input';

export default {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url'],
      description: 'Input type',
    },
    value: {
      control: 'text',
      description: 'Input value',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    label: {
      control: 'text',
      description: 'Input label',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    required: {
      control: 'boolean',
      description: 'Required field indicator',
    },
    error: {
      control: 'text',
      description: 'Error message',
    },
  },
};

export const Default = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithLabel = {
  args: {
    label: 'Email Address',
    type: 'email',
    placeholder: 'your@email.com',
  },
};

export const Required = {
  args: {
    label: 'Username',
    placeholder: 'Enter username',
    required: true,
  },
};

export const WithError = {
  args: {
    label: 'Email',
    type: 'email',
    value: 'invalid-email',
    error: 'Please enter a valid email address',
  },
};

export const Disabled = {
  args: {
    label: 'Disabled Input',
    placeholder: 'This input is disabled',
    disabled: true,
  },
};

export const Password = {
  args: {
    label: 'Password',
    type: 'password',
    placeholder: 'Enter your password',
  },
};

export const Number = {
  args: {
    label: 'Amount',
    type: 'number',
    placeholder: '0.00',
  },
};
