'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthRequestError, type LoginInput } from '@/data/auth-browser';
import { LoginDialog } from './login-dialog';
import { RegistrationDialog, type RegistrationPrefill } from './registration-dialog';
import { accountKey, sessionKey, useLogin } from './session';

interface AuthDialogApi {
  openLogin: (opener?: HTMLElement | null) => void;
  openRegistration: (opener?: HTMLElement | null, prefill?: RegistrationPrefill) => void;
}

const AuthDialogContext = createContext<AuthDialogApi>({
  openLogin: () => {},
  openRegistration: () => {},
});

export function useAuthDialog() {
  return useContext(AuthDialogContext);
}

function useRefreshSessionOnHistoryRestore() {
  const client = useQueryClient();
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      client.removeQueries({ queryKey: accountKey });
      void client.resetQueries({ queryKey: sessionKey });
    };
    addEventListener('pageshow', onPageShow);
    return () => removeEventListener('pageshow', onPageShow);
  }, [client]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationPrefill, setRegistrationPrefill] = useState<RegistrationPrefill | undefined>();
  const [registrationNonce, setRegistrationNonce] = useState(0);
  const openerRef = useRef<HTMLElement | null>(null);
  const inFlightRef = useRef(false);
  const loginMutation = useLogin();
  const { reset } = loginMutation;
  useRefreshSessionOnHistoryRestore();

  const openLogin = useCallback(
    (opener?: HTMLElement | null) => {
      openerRef.current =
        opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      reset();
      setRegistrationPrefill(undefined);
      setRegistrationOpen(false);
      setOpen(true);
    },
    [reset],
  );

  const openRegistration = useCallback(
    (opener?: HTMLElement | null, prefill?: RegistrationPrefill) => {
      openerRef.current =
        opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      reset();
      setOpen(false);
      setRegistrationPrefill(prefill);
      setRegistrationNonce((current) => current + 1);
      setRegistrationOpen(true);
    },
    [reset],
  );

  const close = useCallback(() => {
    setOpen(false);
    setRegistrationOpen(false);
    setRegistrationPrefill(undefined);
    reset();
    inFlightRef.current = false;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
  }, [reset]);

  const { mutate } = loginMutation;
  const submit = useCallback(
    (input: LoginInput) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      mutate(input, {
        onSuccess: () => {
          openerRef.current = null;
          setOpen(false);
        },
        onSettled: () => {
          inFlightRef.current = false;
        },
      });
    },
    [mutate],
  );

  const error = loginMutation.error
    ? loginMutation.error instanceof AuthRequestError
      ? loginMutation.error.code
      : 'auth_unavailable'
    : null;
  const api = useMemo(() => ({ openLogin, openRegistration }), [openLogin, openRegistration]);

  return (
    <AuthDialogContext.Provider value={api}>
      {children}
      <LoginDialog
        open={open}
        pending={loginMutation.isPending}
        error={error}
        onSubmit={submit}
        onClose={close}
      />
      {registrationOpen && (
        <RegistrationDialog
          key={registrationNonce}
          open
          initial={registrationPrefill}
          onClose={close}
          onSignIn={() => {
            setRegistrationPrefill(undefined);
            setRegistrationOpen(false);
            setOpen(true);
          }}
        />
      )}
    </AuthDialogContext.Provider>
  );
}
