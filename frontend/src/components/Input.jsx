const Input = ({
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled = false,
  error = false,
  label,
  id,
  name,
  required = false,
  className = '',
  ...props
}) => {
  const inputId = id || name;

  return (
    <div className={`form-group ${className}`}>
      {label && (
        <label htmlFor={inputId}>
          {label}
          {required && <span style={{ color: '#ff4444' }}> *</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        style={{
          borderColor: error ? '#ff4444' : undefined,
        }}
        {...props}
      />
      {error && typeof error === 'string' && (
        <span style={{ color: '#ff4444', fontSize: '0.875rem', marginTop: '4px', display: 'block' }}>
          {error}
        </span>
      )}
    </div>
  );
};

export default Input;
