import React from "react";
import Link from "next/link";

export interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
  maxWidth?: "default" | "narrow" | "wide" | "full";
}

export function PageContainer({
  children,
  title,
  description,
  backHref,
  backLabel = "Back",
  actions,
  className = "",
  maxWidth = "default",
}: PageContainerProps) {
  const widthClasses = {
    narrow: "max-w-4xl",
    default: "max-w-7xl",
    wide: "max-w-[1440px]",
    full: "max-w-full",
  };

  return (
    <div className={`w-full ${widthClasses[maxWidth]} mx-auto px-4 sm:px-6 lg:px-8 py-8 ${className}`}>
      {/* Optional Breadcrumb / Back Link */}
      {backHref && (
        <div className="mb-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-blue-400 transition-colors group"
          >
            <svg
              className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>{backLabel}</span>
          </Link>
        </div>
      )}

      {/* Header section if title provided */}
      {title && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-slate-800/60">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
              {title}
            </h1>
            {description && (
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
        </div>
      )}

      {/* Main Content */}
      {children}
    </div>
  );
}
