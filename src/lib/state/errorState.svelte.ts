export interface AppError {
  id: number;
  message: string;
  level: 'warn' | 'error';
}

let errors = $state<AppError[]>([]);
let nextId = 0;

export function getErrorState() {
  return {
    get errors() {
      return errors;
    },
    set errors(v: AppError[]) {
      errors = v;
    },
  };
}

/**
 * Push a notification and auto-dismiss after `ms` milliseconds.
 * Returns the error id for potential manual dismissal.
 */
export function pushError(message: string, level: 'warn' | 'error' = 'error', ms = 4000): number {
  const id = nextId++;
  errors = [...errors, { id, message, level }];
  setTimeout(() => {
    errors = errors.filter((e) => e.id !== id);
  }, ms);
  return id;
}

export function dismissError(id: number): void {
  errors = errors.filter((e) => e.id !== id);
}
