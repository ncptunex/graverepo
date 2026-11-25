// Search form (graveyard-dashboard task 5.1, R2.1, R2.6, R9.10).
// One visible label, one field, one button. Enter submits. The typed text is kept. An error
// is shown next to the field and linked to it.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { APP_TEXT } from './ui-text';

export type SearchFormProps = {
  /** Text to start with, for example the query kept after an error. */
  readonly initialValue?: string;
  /** Error text for the field, or null. */
  readonly errorMessage?: string | null;
  readonly onSearch: (text: string) => void;
};

export function SearchForm({ initialValue = '', errorMessage = null, onSearch }: SearchFormProps) {
  const [value, setValue] = useState(initialValue);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  // When the field has an error, focus goes to the field so the visitor can correct it. The error text
  // is linked to the field, so it is read out with it. This runs after the view heading's focus move.
  useEffect(() => {
    if (errorMessage !== null) inputRef.current?.focus();
  }, [errorMessage]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    onSearch(value);
  }

  return (
    <form onSubmit={submit} className="stack" role="search">
      <div className="stack">
        <label htmlFor={inputId}>{APP_TEXT.searchLabel}</label>
        <div className="row">
          <input
            ref={inputRef}
            id={inputId}
            className="field"
            type="text"
            value={value}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errorMessage !== null ? true : undefined}
            aria-describedby={errorMessage !== null ? errorId : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" className="button button--primary">
            {APP_TEXT.searchButton}
          </button>
        </div>
        {errorMessage !== null && (
          <p id={errorId} className="muted" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    </form>
  );
}
