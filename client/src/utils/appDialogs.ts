export type AppToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface AppConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface AppPromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ToastHandler = (message: string, variant: AppToastVariant) => void;
type ConfirmHandler = (options: AppConfirmOptions) => Promise<boolean>;
type PromptHandler = (options: AppPromptOptions) => Promise<string | null>;

let toastHandler: ToastHandler | null = null;
let confirmHandler: ConfirmHandler | null = null;
let promptHandler: PromptHandler | null = null;

/** Register active UI host handlers (called by `<AppDialogHost />`). */
export function registerAppDialogHandlers(handlers: {
  toast: ToastHandler;
  confirm: ConfirmHandler;
  prompt: PromptHandler;
}): () => void {
  toastHandler = handlers.toast;
  confirmHandler = handlers.confirm;
  promptHandler = handlers.prompt;
  return () => {
    if (toastHandler === handlers.toast) toastHandler = null;
    if (confirmHandler === handlers.confirm) confirmHandler = null;
    if (promptHandler === handlers.prompt) promptHandler = null;
  };
}

/** Display a non-blocking in-app toast notification. */
export function appToast(message: string, variant: AppToastVariant = 'info'): void {
  if (toastHandler) {
    toastHandler(message, variant);
  }
}

/** Open an accessible in-app confirmation modal returning `true` or `false`. */
export function appConfirm(options: string | AppConfirmOptions): Promise<boolean> {
  const opts: AppConfirmOptions =
    typeof options === 'string' ? { message: options } : options;
  if (confirmHandler) {
    return confirmHandler(opts);
  }
  return Promise.resolve(false);
}

/** Open an in-app text input modal returning entered text or `null` if cancelled. */
export function appPrompt(options: AppPromptOptions): Promise<string | null> {
  if (promptHandler) {
    return promptHandler(options);
  }
  return Promise.resolve(null);
}
