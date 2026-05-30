export function BrandAccents() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-moja-aqua opacity-[0.15]" />
      <div className="absolute top-1/3 -left-12 w-28 h-28 rounded-full bg-moja-pink opacity-[0.12]" />
      <div className="absolute bottom-20 right-10 w-24 h-24 rounded-full bg-moja-yellow opacity-[0.18]" />
      <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-moja-orange opacity-[0.10]" />
      <div className="absolute top-16 left-1/3 w-16 h-16 rounded-full bg-moja-aqua opacity-[0.12]" />
    </div>
  );
}

export function BrandDots({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-3 h-3 rounded-full bg-moja-orange" />
      <div className="w-3 h-3 rounded-full bg-moja-aqua" />
      <div className="w-3 h-3 rounded-full bg-moja-yellow" />
    </div>
  );
}
