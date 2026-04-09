import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Accedi</CardTitle>
        <CardDescription>
          Usa l&apos;email del tuo workspace NIMA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="text-xs text-muted-foreground text-center">
          Non hai un account?{" "}
          <Link href="/register" className="text-gold hover:underline">
            Registrati
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
