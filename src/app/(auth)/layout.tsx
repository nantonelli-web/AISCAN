import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 grid place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="AISCAN" className="h-[80px]" />
        </Link>
        {children}
      </div>
    </div>
  );
}
