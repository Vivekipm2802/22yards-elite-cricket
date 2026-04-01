// @ts-nocheck
import React from 'react';
import { motion } from 'framer-motion';

interface MotionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const MotionButton: React.FC<MotionButtonProps> = ({ children, onClick, className = "", disabled = false }) => {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={onClick}
      disabled={disabled}
      className={`px-8 py-4 rounded-xl font-black tracking-[0.1em] transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 uppercase text-xs ${className}`}
    >
      {children}
    </motion.button>
  );
};

export default MotionButton;
