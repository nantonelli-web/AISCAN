import { LanguageSwitcher } from "@/components/layout/language-switcher";

export async function Header() {
  return (
    <header className="h-16 bg-background flex items-center justify-end px-6">
      <LanguageSwitcher />
    </header>
  );
}
