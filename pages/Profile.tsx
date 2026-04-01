// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Camera, Shield, User, Star,
  CheckCircle2, RefreshCw, Upload, Sparkles,
  Zap, Save, MapPin, Calendar, Smartphone, Target,
  Activity, Swords, Disc, Settings, QrCode, Share2
} from 'lucide-react';
import MotionButton from '../components/MotionButton';
import GlassCard from '../components/GlassCard';

interface ProfileProps {
  currentName: string;
  currentRole: string;
  currentAvatar: string;
  onSave: (name: string, role: string, avatar: string, age: string, city: string, battingStyle: string, bowlingStyle: string) => void;
  onBack: () => void;
}

// B-14 fix: unified role list â Login roles added first so existing users see pre-selection
const ROLES = [
  'All-Rounder',
  'Batsman',
  'Bowler',
  'Wicket Keeper',
  'Pro All-Rounder',
  'Elite Batsman',
  'Express Bowler',
  'Master Spinner',
  'Defensive Wall',
  'Power Finisher'
];

const BATTING_STYLES = ['Right Hand', 'Left Hand'];
const BOWLING_STYLES = ['Right Arm Fast', 'Left Arm Fast', 'Right Arm Spin', 'Left Arm Spin', 'Medium Pace'];

const Profile: React.FC<ProfileProps> = ({ currentName, currentRole, currentAvatar, onSave, onBack }) => {
  const savedData = JSON.parse(localStorage.getItem('22YARDS_USER_DATA') || '{}');
  
  const [name, setName] = useState(savedData.name || currentName);
  const [role, setRole] = useState(savedData.role || currentRole);
  const [avatar, setAvatar] = useState(savedData.avatar || currentAvatar);
  const [age, setAge] = useState(savedData.age || '');
  const [city, setCity] = useState(savedData.city || '');
  const [battingStyle, setBattingStyle] = useState(savedData.battingStyle || 'Right Hand');
  const [bowlingStyle, setBowlingStyle] = useState(savedData.bowlingStyle || 'Right Arm Fast');
  // B-15 fix: functional toggles with localStorage persistence
  const [privacyMode, setPrivacyMode] = useState<boolean>(savedData.privacyMode || false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(savedData.notificationsEnabled !== false);

  // QR Code
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate QR code whenever name/phone changes
  useEffect(() => {
    const phone = savedData.phone || '';
    if (!phone && !name) return;
    const payload = JSON.stringify({
      name: name || savedData.name,
      phone,
      role: role || savedData.role,
      battingStyle: battingStyle || savedData.battingStyle,
      bowlingStyle: bowlingStyle || savedData.bowlingStyle,
      age: age || savedData.age,
      city: city || savedData.city,
      app: '22YARDS'
    });
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(payload, {
        width: 200,
        margin: 2,
        color: { dark: '#00F0FF', light: '#020617' }
      }).then(url => setQrDataUrl(url)).catch(() => {});
    }).catch(() => {});
  }, [name, role, battingStyle, bowlingStyle, age, city]);

  const handleTogglePrivacy = () => {
    const newVal = !privacyMode;
    setPrivacyMode(newVal);
    const curr = JSON.parse(localStorage.getItem('22YARDS_USER_DATA') || '{}');
    localStorage.setItem('22YARDS_USER_DATA', JSON.stringify({ ...curr, privacyMode: newVal }));
  };

  const handleToggleNotifications = () => {
    const newVal = !notificationsEnabled;
    setNotificationsEnabled(newVal);
    const curr = JSON.parse(localStorage.getItem('22YARDS_USER_DATA') || '{}');
    localStorage.setItem('22YARDS_USER_DATA', JSON.stringify({ ...curr, notificationsEnabled: newVal }));
  };

  const generateNewAvatar = () => {
    const newSeed = Math.random().toString(36).substring(7);
    setAvatar(`https://api.dicebear.com/7.x/avataaars/svg?seed=${newSeed}&backgroundColor=020617`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="h-full bg-[#020617] text-white flex flex-col overflow-hidden"
    >
      {/* Refined Header */}
      <div className="h-14 flex items-center px-5 shrink-0 border-b border-white/5 bg-[#020617] z-[100]">
        <button onClick={onBack} className="p-2 -ml-2 text-[#00F0FF] hover:bg-white/5 rounded-full transition-all">
          <ChevronLeft size={16} />
        </button>
        <h4 className="font-heading text-lg uppercase tracking-[0.2em] flex-1 text-[#00F0FF] ml-1">IDENTITY CONFIG</h4>
        <Shield size={12} className="text-[#39FF14] opacity-50" />
      </div>

      {/* Increased padding-bottom to ensure full scrollability past fixed UI elements */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-80">
        {/* Avatar Sector */}
        <div className="flex flex-col items-center space-y-4 pt-2">
          <div className="relative">
            <div className="w-28 h-28 rounded-[36px] bg-gradient-to-tr from-[#00F0FF]/20 via-black to-[#39FF14]/10 border border-white/10 p-1 shadow-2xl relative z-10 overflow-hidden">
              <img src={avatar} className="w-full h-full object-cover rounded-[30px] saturate-125" alt="Avatar" />
            </div>
            
            <div className="absolute -bottom-2 -right-2 z-20 flex space-x-1">
              <button onClick={generateNewAvatar} className="w-8 h-8 bg-black border border-white/10 rounded-xl flex items-center justify-center text-[#00F0FF] hover:bg-[#00F0FF] hover:text-black transition-all shadow-xl">
                <RefreshCw size={12} />
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 bg-[#39FF14] text-black rounded-xl flex items-center justify-center hover:scale-105 transition-all shadow-xl">
                <Upload size={12} />
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
          </div>
          <div className="flex items-center space-x-1.5 text-[#39FF14]/60">
            <CheckCircle2 size={10} />
            <span className="text-[8px] font-black uppercase tracking-widest">Digital Roster Verified</span>
          </div>
        </div>

        {/* Data Sectors */}
        <div className="space-y-7">
          {/* Section 1: Demographics */}
          <section className="space-y-3">
             <div className="flex items-center space-x-2 ml-1">
                <User size={12} className="text-[#00F0FF]" />
                <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Primary Identity</h3>
             </div>
             <GlassCard className="p-5 bg-white/[0.01] border-white/5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-white/20 uppercase tracking-widest ml-1">ATHLETE NAME</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-sm outline-none focus:border-[#00F0FF]/40 transition-all font-bold text-white shadow-inner"
                    placeholder="Legal Name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                     <label className="text-[8px] font-black text-white/20 uppercase tracking-widest ml-1">AGE</label>
                     <div className="relative">
                        <Calendar size={10} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10" />
                        <input 
                          type="number" 
                          value={age} 
                          onChange={(e) => setAge(e.target.value)}
                          className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm outline-none focus:border-[#39FF14]/40 transition-all font-numbers font-bold text-white"
                          placeholder="YY"
                        />
                     </div>
                   </div>
                   <div className="space-y-1.5">
                     <label className="text-[8px] font-black text-white/20 uppercase tracking-widest ml-1">CITY</label>
                     <div className="relative">
                        <MapPin size={10} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10" />
                        <input 
                          type="text" 
                          value={city} 
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm outline-none focus:border-[#00F0FF]/40 transition-all font-bold text-white uppercase"
                          placeholder="Location"
                        />
                     </div>
                   </div>
                </div>
             </GlassCard>
          </section>

          {/* Section 2: Combat Specs (The "etc." fields) */}
          <section className="space-y-3">
             <div className="flex items-center space-x-2 ml-1">
                <Activity size={12} className="text-[#39FF14]" />
                <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Combat Specifications</h3>
             </div>
             <GlassCard className="p-5 bg-white/[0.01] border-white/5 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Swords size={10} className="text-white/20" />
                    <label className="text-[8px] font-black text-white/20 uppercase tracking-widest">BATTING HANDEDNESS</label>
                  </div>
                  <div className="flex gap-2">
                    {BATTING_STYLES.map(s => (
                      <button key={s} onClick={() => setBattingStyle(s)} className={`flex-1 py-3 rounded-xl border text-[8px] font-black tracking-widest transition-all ${battingStyle === s ? 'bg-[#00F0FF] text-black border-[#00F0FF] shadow-lg shadow-[#00F0FF]/20' : 'bg-white/5 border-white/5 text-white/30'}`}>{s.toUpperCase()}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Disc size={10} className="text-white/20" />
                    <label className="text-[8px] font-black text-white/20 uppercase tracking-widest">BOWLING PROTOCOL</label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BOWLING_STYLES.map(s => (
                      <button key={s} onClick={() => setBowlingStyle(s)} className={`py-3 rounded-xl border text-[8px] font-black tracking-widest transition-all ${bowlingStyle === s ? 'bg-[#39FF14] text-black border-[#39FF14] shadow-lg shadow-[#39FF14]/20' : 'bg-white/5 border-white/5 text-white/30'}`}>{s.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
             </GlassCard>
          </section>

          {/* Section 3: Designation */}
          <section className="space-y-3">
             <div className="flex items-center space-x-2 ml-1">
                <Target size={12} className="text-[#FFD700]" />
                <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Primary Role</h3>
             </div>
             <div className="grid grid-cols-2 gap-2">
                {ROLES.map(r => (
                  <button 
                    key={r}
                    onClick={() => setRole(r)}
                    className={`py-3.5 px-3 rounded-xl border transition-all text-center ${
                      role === r 
                      ? 'bg-[#FFD700]/10 border-[#FFD700] text-white shadow-lg' 
                      : 'bg-white/[0.01] border-white/5 text-white/30'
                    }`}
                  >
                    <p className="text-[8px] font-black uppercase tracking-widest">{r}</p>
                  </button>
                ))}
             </div>
          </section>

          {/* Section 4: System Preferences (Was previously hard to reach) */}
          <section className="space-y-3">
             <div className="flex items-center space-x-2 ml-1">
                <Settings size={12} className="text-[#FF1744]" />
                <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">System Preferences</h3>
             </div>
             <GlassCard className="p-5 bg-white/[0.01] border-white/5 space-y-4">
                {/* B-15 fix: functional toggle â Tactical Privacy */}
                <div className="flex items-center justify-between" onClick={handleTogglePrivacy} role="button" tabIndex={0}>
                  <div className="space-y-0.5">
                    <p className="font-bold text-xs uppercase text-white/80">Tactical Privacy</p>
                    <p className="text-[7px] text-white/20 uppercase tracking-widest">Hide stats from global observers</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-all ${privacyMode ? 'bg-[#00F0FF]/20 border border-[#00F0FF]/40 flex justify-end' : 'bg-white/5 border border-white/10 flex justify-start'}`}>
                    <div className={`w-3 h-3 rounded-full transition-all ${privacyMode ? 'bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]' : 'bg-white/20'}`} />
                  </div>
                </div>
                {/* B-15 fix: functional toggle â Notification Sync */}
                <div className="flex items-center justify-between" onClick={handleToggleNotifications} role="button" tabIndex={0}>
                  <div className="space-y-0.5">
                    <p className="font-bold text-xs uppercase text-white/80">Notification Sync</p>
                    <p className="text-[7px] text-white/20 uppercase tracking-widest">Receive match day alerts</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-all ${notificationsEnabled ? 'bg-[#39FF14]/20 border border-[#39FF14]/40 flex justify-end' : 'bg-white/5 border border-white/10 flex justify-start'}`}>
                    <div className={`w-3 h-3 rounded-full transition-all ${notificationsEnabled ? 'bg-[#39FF14] shadow-[0_0_8px_#39FF14]' : 'bg-white/20'}`} />
                  </div>
                </div>
             </GlassCard>
          </section>

          {/* Section 5: Player Identity QR */}
          <section className="space-y-3">
             <div className="flex items-center space-x-2 ml-1">
                <QrCode size={12} className="text-[#00F0FF]" />
                <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Player Identity QR</h3>
             </div>
             <GlassCard className="p-5 bg-white/[0.01] border-white/5 flex flex-col items-center space-y-4">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/20 text-center">
                  Share this QR to let teammates add you directly
                </p>
                {qrDataUrl ? (
                  <div className="p-3 bg-[#020617] border border-[#00F0FF]/20 rounded-2xl shadow-[0_0_30px_rgba(0,240,255,0.1)]">
                    <img src={qrDataUrl} alt="Player QR Code" className="w-40 h-40 rounded-xl" />
                  </div>
                ) : (
                  <div className="w-40 h-40 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <QrCode size={48} className="text-white/10" />
                  </div>
                )}
                <div className="text-center space-y-1">
                  <p className="font-heading text-xl italic uppercase text-white leading-none">{name || 'â'}</p>
                  <p className="text-[8px] font-black text-[#00F0FF] uppercase tracking-widest">{role || 'â'}</p>
                </div>
             </GlassCard>
          </section>
        </div>
      </div>

      {/* Persistent Action Footer */}
      <div className="fixed bottom-20 left-0 right-0 p-8 z-[100] bg-[#020617] border-t border-white/5 backdrop-blur-xl">
        <MotionButton 
          onClick={() => onSave(name, role, avatar, age, city, battingStyle, bowlingStyle)}
          className="w-full bg-[#00F0FF] text-black py-5 !rounded-2xl font-black tracking-[0.5em] uppercase shadow-2xl flex items-center justify-center space-x-2 text-[10px]"
        >
          <Save size={14} />
          <span>COMMIT CHANGES</span>
        </MotionButton>
      </div>
    </motion.div>
  );
};

export default Profile;
