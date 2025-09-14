import React from 'react';

interface GraffitiPanelProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outlined' | 'transparent';
}

export const GraffitiPanel: React.FC<GraffitiPanelProps> = ({
  children,
  className = '',
  variant = 'default',
}) => {
  const baseClasses = 'relative backdrop-blur-sm border-2 rounded-lg transition-all duration-300';
  
  const variantClasses = {
    default: 'bg-gray-900/80 border-cyan-400/50 shadow-lg shadow-cyan-400/20',
    outlined: 'bg-transparent border-pink-500/60 shadow-lg shadow-pink-500/20',
    transparent: 'bg-white/5 border-white/20 shadow-lg shadow-black/20',
  };
  
  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      <div className="relative z-10 p-6">
        {children}
      </div>
    </div>
  );
};