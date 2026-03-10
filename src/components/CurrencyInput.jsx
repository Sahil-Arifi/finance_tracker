import { sanitizeCurrencyString } from "../utils/currencyInput";

/**
 * Text field with $ prefix; use string state and Number() on submit / blur.
 */
export default function CurrencyInput({
  id,
  value,
  onValueChange,
  className = "",
  inputClassName = "",
  hasError = false,
  ...rest
}) {
  return (
    <div className={`currency-input${hasError ? " currency-input--error" : ""} ${className}`.trim()}>
      <span className="currency-input__prefix" aria-hidden="true">
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={`currency-input__field field-input ${inputClassName}`.trim()}
        value={value}
        {...rest}
        onChange={(e) => onValueChange(sanitizeCurrencyString(e.target.value))}
      />
    </div>
  );
}
