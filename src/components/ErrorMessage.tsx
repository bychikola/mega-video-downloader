import { AlertTriangle } from "lucide-react";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="
      w-full max-w-2xl mx-auto
      flex flex-col items-center gap-4 p-8
      bg-[#151619] border border-red-500/20
    ">
      <div className="w-12 h-12 flex items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle size={22} className="text-red-400" />
      </div>

      <p className="text-sm text-center text-[#908F8C] leading-relaxed max-w-md">
        {message}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="
            px-5 py-2 text-sm font-medium tracking-wide uppercase
            text-[#F0EFEA] bg-[#1D1E22] border border-white/10
            transition-all duration-300 ease-out
            select-none
          "
        >
          Try again
        </button>
      )}
    </div>
  );
}
