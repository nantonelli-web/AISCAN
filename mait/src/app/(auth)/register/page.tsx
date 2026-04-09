import Link from "next/link";
import { RegisterForm } from "./register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Crea il tuo account</CardTitle>
        <CardDescription>
          Inserisci i tuoi dati. Ti verrà assegnato un nuovo workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <p className="text-xs text-muted-foreground text-center">
          Hai già un account?{" "}
          <Link href="/login" className="text-gold hover:underline">
            Accedi
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
