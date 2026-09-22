"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const AuthSignInCard = () => {
  const [signInError, setSignInError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSignIn = async () => {
    setSignInError("");
    setLoading(true);

    try {
      const result = await authClient.signIn.social({
        provider: "planning-center",
        callbackURL: "/services",
        errorCallbackURL: "/auth",
      });
      if (result.error) {
        setSignInError(
          result.error.message ?? "Unable to start sign in. Please try again."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to start sign in. Please try again.";
      setSignInError(message);
    }
    setLoading(false);
  };

  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Continue with your Planning Center account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {signInError && (
              <Alert variant="destructive">
                <AlertDescription>{signInError}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void handleSignIn();
              }}
              disabled={loading}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Redirecting...
                </span>
              ) : (
                "Continue with Planning Center"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};
