import React from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 16,
  borderRadius = "4px",
  className = "",
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius,
      }}
    />
  );
};

interface SkeletonTextProps {
  lines?: number;
  lastLineWidth?: string | number;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lastLineWidth = "60%",
}) => {
  return (
    <div className="skeleton-text">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? lastLineWidth : "100%"}
        />
      ))}
    </div>
  );
};

export const SkeletonCard: React.FC = () => {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-header">
        <Skeleton width={32} height={32} borderRadius="8px" />
        <div className="skeleton-card-title">
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={10} />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
};

export const SkeletonBadge: React.FC = () => {
  return <Skeleton width={60} height={20} borderRadius="999px" />;
};
