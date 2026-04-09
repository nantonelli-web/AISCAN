import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 grid place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="block text-center mb-8 text-xs uppercase tracking-[0.2em] text-gold"
        >
          ◆ MAIT · NIMA Digital
        </Link>
        {children}
      </div>
    </div>
  );
}
