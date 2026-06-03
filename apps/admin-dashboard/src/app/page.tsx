/// Admin Dashboard — Login Page
///
/// Firebase Auth Web SDK handles client-side Google + Phone sign-in.
/// The Firebase ID token is exchanged for SafePass JWT via POST /v1/auth/token-exchange.

'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { apiClient } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone auth state
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const recapElementRef = useRef<HTMLDivElement>(null);

  const exchangeTokenAndRedirect = useCallback(
    async (idToken: string) => {
      const data: { accessToken: string; refreshToken: string } =
        await apiClient('/v1/auth/token-exchange', {
          method: 'POST',
          body: { firebaseIdToken: idToken },
        });
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      router.push('/dashboard');
    },
    [router]
  );

  // --- Google Sign-In ---
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(
        getFirebaseAuth(),
        new GoogleAuthProvider()
      );
      const idToken = await result.user.getIdToken();
      await exchangeTokenAndRedirect(idToken);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // --- Phone Sign-In ---
  const openPhoneDialog = () => {
    setShowPhoneDialog(true);
    setPhoneStep('input');
    setPhoneNumber('');
    setOtpCode('');
    setConfirmationResult(null);
    setError(null);
  };

  const closePhoneDialog = () => {
    setShowPhoneDialog(false);
    setIsLoading(false);
    // Clean up recaptcha verifier if still active
  };

  const handleSendOtp = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter your phone number');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();

      // Create a reCAPTCHA verifier if not already present
      if (!recapElementRef.current) return;
      const verifier = new RecaptchaVerifier(auth, recapElementRef.current, {
        size: 'invisible',
      });

      const result = await signInWithPhoneNumber(
        auth,
        phoneNumber.trim(),
        verifier
      );
      setConfirmationResult(result);
      setPhoneStep('otp');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to send verification code'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim() || !confirmationResult) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await confirmationResult.confirm(otpCode.trim());
      const idToken = await result.user.getIdToken();
      await exchangeTokenAndRedirect(idToken);
      closePhoneDialog();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid verification code'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <svg
              className="h-10 w-10 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-dark">SafePass</h1>
          <p className="mt-1 text-sm text-slate-500">Admin Dashboard</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Auth Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          <button
            onClick={openPhoneDialog}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-safety-green px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-safety-green/90 disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            Continue with Phone
          </button>

          <button
            disabled
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-400"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continue with Facebook <span className="text-xs">(coming soon)</span>
          </button>
        </div>
      </div>

      {/* Phone Auth Dialog */}
      {showPhoneDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-dark">
                {phoneStep === 'input' ? 'Phone Sign-In' : 'Verify Code'}
              </h2>
              <button
                onClick={closePhoneDialog}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {phoneStep === 'input' ? (
              <>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+2348012345678"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
                <div ref={recapElementRef} />
                <button
                  onClick={handleSendOtp}
                  disabled={isLoading}
                  className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isLoading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-500">
                  Enter the code sent to {phoneNumber}
                </p>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg tracking-widest focus:border-primary focus:outline-none"
                />
                <button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otpCode.length < 6}
                  className="mt-4 w-full rounded-xl bg-safety-green py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isLoading ? 'Verifying...' : 'Verify'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
