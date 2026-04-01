// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Zap } from 'lucide-react';

const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(onComplete, 4200);
    const interval = setInterval(() => {
      setPercent(prev => {
        if (prev >= 100) return 100;
        const remaining = 100 - prev;
        const jump = Math.max(1, Math.floor(Math.random() * (remaining * 0.2)));
        return prev + jump;
      });
    }, 120);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [onComplete]);

  const logoLetters = "22YARDS".split("");

  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center z-[1000] overflow-hidden p-6">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-40" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00F0FF]/5 blur-[100px] rounded-full pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center w-full max-w-md"
      >
        <div className="relative mb-12 flex items-center justify-center">
          <svg viewBox="0 0 300 300" className="absolute w-[240px] h-[240px] pointer-events-none drop-shadow-[0_0_15px_rgba(0,240,255,0.2)]">
            <motion.path
              d="M150,30 C220,30 270,80 270,150 C270,220 200,270 150,270 C80,270 30,200 30,150 C30,100 80,30 150,30"
              fill="none"
              stroke="#00F0FF"
              strokeWidth="1"
              strokeOpacity="0.2"
              initial={{ pathLength: 0, rotate: 0 }}
              animate={{ pathLength: 1, rotate: 360 }}
              transition={{ pathLength: { duration: 2, ease: "easeInOut" }, rotate: { duration: 25, repeat: Infinity, ease: "linear" } }}
            />
            <motion.path
              d="M150,45 C210,35 255,100 255,150 C255,200 210,255 150,255 C90,265 45,210 45,150 C45,90 90,55 150,45"
              fill="none"
              stroke="#39FF14"
              strokeWidth="0.8"
              strokeDasharray="6 10"
              strokeOpacity="0.25"
              initial={{ pathLength: 0, rotate: 0 }}
              animate={{ pathLength: 1, rotate: -360 }}
              transition={{ pathLength: { duration: 2.5, ease: "easeInOut", delay: 0.3 }, rotate: { duration: 35, repeat: Infinity, ease: "linear" } }}
            />
          </svg>
          
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-40 h-60 flex items-center justify-center perspective-[1000px]"
          >
            <motion.div
              initial={{ rotateX: 60, opacity: 0, translateZ: -80 }}
              animate={{ rotateX: 25, opacity: 1, translateZ: 0 }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-30 h-52"
            >
              <svg viewBox="0 0 100 200" className="w-full h-full drop-shadow-[0_0_30px_rgba(0,240,255,0.3)]">
                <defs>
                  <linearGradient id="pitchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#39FF14" stopOpacity="0.08" />
                    <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#39FF14" stopOpacity="0.08" />
                  </linearGradient>
                </defs>
                {/* 22-Yard Pitch Perspective Trapezoid */}
                <path d="M18,10 L82,10 L95,190 L5,190 Z" fill="url(#pitchGrad)" stroke="rgba(0,240,255,0.2)" strokeWidth="0.6" />
                
                {/* Far End (Top) Crease and Stumps */}
                <motion.path d="M22,35 L78,35" stroke="#00F0FF" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
                <g className="opacity-60 drop-shadow-[0_0_3px_rgba(0,240,255,0.4)]">
                  <rect x="47.5" y="24" width="1" height="11" fill="#00F0FF" rx="0.3" />
                  <rect x="49.5" y="24" width="1" height="11" fill="#00F0FF" rx="0.3" />
                  <rect x="51.5" y="24" width="1" height="11" fill="#00F0FF" rx="0.3" />
                </g>

                {/* Near End (Bottom) Crease and Stumps */}
                <motion.path d="M10,165 L90,165" stroke="#00F0FF" strokeWidth="2" strokeLinecap="round" />
                <g className="drop-shadow-[0_0_6px_rgba(0,240,255,0.6)]">
                  <motion.rect x="46.5" y="165" width="1.5" height="16" fill="#00F0FF" rx="0.4" />
                  <motion.rect x="49.25" y="165" width="1.5" height="16" fill="#00F0FF" rx="0.4" />
                  <motion.rect x="52" y="165" width="1.5" height="16" fill="#00F0FF" rx="0.4" />
                </g>
              </svg>
            </motion.div>
          </motion.div>
        </div>

        <div className="text-center space-y-4">
          <motion.div className="flex items-center justify-center space-x-4 mb-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[#00F0FF]/20" />
            <span className="text-[9px] font-black tracking-[0.6em] text-[#00F0FF] uppercase opacity-80">The T20 Night Icon</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[#00F0FF]/20" />
          </motion.div>
          
          <div className="flex justify-center items-center">
            {logoLetters.map((char, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 1 + (i * 0.06), duration: 0.7 }}
                className="font-heading text-7xl md:text-8xl logo-neon px-1 leading-none font-black tracking-tight"
              >
                {char}
              </motion.span>
            ))}
          </div>
          
          <motion.div className="flex items-center justify-center space-x-2.5 text-[#00F0FF]/30">
            <ShieldCheck size={12} className="text-[#00F0FF]" />
            <p className="text-[9px] tracking-[0.4em] uppercase font-black">Stadium Network Verified</p>
          </motion.div>
        </div>
      </motion.div>

      <div className="absolute bottom-12 w-full max-w-xs space-y-5 px-4">
        <div className="flex justify-between items-end">
          <div className="space-y-0.5">
            <span className="block text-[8px] font-black text-[#00F0FF]/30 uppercase tracking-[0.3em]">Protocol 22.Y</span>
            <span className="block text-[11px] font-black text-white/60 uppercase tracking-widest">
              {percent < 100 ? 'Illuminating Arena' : 'Game Ready'}
            </span>
          </div>
          <div className="text-right">
             <motion.span key={percent} className="font-numbers text-3xl text-[#00F0FF] font-black leading-none drop-shadow-[0_0_8px_rgba(0,240,255,0.3)]">
               {percent}
             </motion.span>
             <span className="text-[#00F0FF]/30 text-[10px] font-black ml-0.5">%</span>
          </div>
        </div>
        
        <div className="h-[3px] w-full bg-white/[0.03] rounded-full relative overflow-hidden backdrop-blur-sm">
          <motion.div initial={{ width: "0%" }} animate={{ width: `${percent}%` }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="h-full bg-gradient-to-r from-[#00F0FF] via-[#39FF14] to-[#00F0FF] relative rounded-full" />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
