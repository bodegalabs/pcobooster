"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export function AuthSignInCard() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session) {
      router.replace("/");
      router.refresh();
    }
  }, [router, session]);

  const handleSignIn = async () => {
    setError("");
    setLoading(true);

    try {
      await authClient.signIn.oauth2({
        providerId: "planning-center",
        callbackURL: "/",
        errorCallbackURL: "/auth",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to start sign in. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
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
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={handleSignIn}
              disabled={loading || isPending}
            >
              {loading || isPending ? (
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
}
