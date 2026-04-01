
// @ts-nocheck
import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { 
  Search, MapPin, Star, Filter, Info, ChevronLeft, 
  Zap, Car, Users, Video, ShieldCheck, Calendar as CalendarIcon,
  Clock, ArrowRight, MessageSquare, Camera, CheckCircle2,
  Phone, Lightbulb, Coffee, Droplets, Map, PlayCircle,
  // Added missing icon imports
  ChevronRight, X
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MotionButton from '../components/MotionButton';

// --- Types ---
interface Venue {
  id: string;
  name: string;
  image: string;
  distance: string;
  rating: number;
  reviewCount: number;
  priceStart: number;
  pitchType: 'Turf' | 'Grass' | 'Matting';
  location: string;
  owner: {
    name: string;
    avatar: string;
    verified: boolean;
    role: string;
  };
  amenities: { name: string, icon: any }[];
  pricing: {
    label: string;
    price: number;
    format: string;
  }[];
  guestPhotos: string[];
  reviews: {
    user: string;
    comment: string;
    rating: number;
    date: string;
  }[];
}

// --- Enhanced Mock Data ---
const VENUES: Venue[] = [
  {
    id: 'v1',
    name: 'The Royal Turf Arena',
    image: 'https://images.unsplash.com/photo-1589487391730-58f20eb2c308?auto=format&fit=crop&q=80&w=1200',
    distance: '2.5 km away',
    rating: 4.8,
    reviewCount: 124,
    priceStart: 800,
    pitchType: 'Turf',
    location: 'Palika Stadium West, Kanpur',
    owner: { name: 'Coach Rahul S.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul', verified: true, role: 'Head Curator' },
    amenities: [
      { name: 'Floodlights', icon: Lightbulb },
      { name: 'Canteen', icon: Coffee },
      { name: 'Washrooms', icon: Droplets },
      { name: 'Live Stream', icon: Video },
      { name: 'Parking', icon: Car }
    ],
    pricing: [
      { label: 'T-10 / Box', price: 800, format: '90 Mins' },
      { label: 'T-20 Match', price: 1500, format: '3 Hours' },
      { label: 'Full Day', price: 5000, format: '8 Hours' },
    ],
    guestPhotos: [
      'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&q=80&w=400',
      'https://images.unsplash.com/photo-1624194301550-984433e14436?auto=format&fit=crop&q=80&w=400',
      'https://images.unsplash.com/photo-1540747913346-19e3ad643649?auto=format&fit=crop&q=80&w=400',
      'https://images.unsplash.com/photo-1593341604935-03b44758e234?auto=format&fit=crop&q=80&w=400'
    ],
    reviews: [
      { user: 'Team Avengers', comment: 'Pitch quality is unmatched. The 1080p stream kit they provide is amazing!', rating: 5, date: '2 days ago' },
      { user: 'Nitro XI', comment: 'Great drainage system, we played right after heavy rain.', rating: 4, date: '1 week ago' },
    ]
  },
  {
    id: 'v2',
    name: 'Lords Pavilion Chakeri',
    image: 'https://images.unsplash.com/photo-1594470117722-14589fbf9911?auto=format&fit=crop&q=80&w=1200',
    distance: '5.2 km away',
    rating: 4.5,
    reviewCount: 89,
    priceStart: 1200,
    pitchType: 'Grass',
    location: 'Airforce Base Area, Kanpur',
    owner: { name: 'Amit Kumar', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Amit', verified: true, role: 'Venue Owner' },
    amenities: [
      { name: 'Parking', icon: Car },
      { name: 'Dugout', icon: Users },
      { name: 'Umpire', icon: ShieldCheck }
    ],
    pricing: [
      { label: 'T-20 Match', price: 2000, format: '4 Hours' },
      { label: 'Corporate Day', price: 6500, format: '9 Hours' },
    ],
    guestPhotos: [
      'https://images.unsplash.com/photo-1589487391730-58f20eb2c308?auto=format&fit=crop&q=80&w=400'
    ],
    reviews: [
      { user: 'Gully Boys', comment: 'Excellent grass maintenance. A bit far but worth it for the vibe.', rating: 4, date: '3 days ago' },
    ]
  }
];

const Arena: React.FC = () => {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showBooking, setShowBooking] = useState(false);

  const filteredVenues = useMemo(() => {
    return VENUES.filter(v => 
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
      (activeFilter === 'All' || v.pitchType === activeFilter)
    );
  }, [searchQuery, activeFilter]);

  return (
    <div className="min-h-screen bg-black text-white pb-40 scroll-container overflow-y-auto overflow-x-hidden">
      <AnimatePresence mode="wait">
        {!selectedVenue ? (
          <motion.div 
            key="list" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="p-6 space-y-8"
          >
            {/* Discovery Header */}
            <div className="space-y-6 pt-6">
              <div className="flex items-center space-x-2 bg-[#00F0FF]/10 border border-[#00F0FF]/30 w-fit px-3 py-1 rounded-full mb-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-pulse" />
                 <span className="text-[8px] font-black text-[#00F0FF] uppercase tracking-[0.3em]">Module Status: Coming Soon</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h1 className="font-heading text-6xl tracking-tighter leading-none">ARENA</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Ground Marketplace</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <Filter size={20} className="text-[#FFC107]" />
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#FFC107] transition-colors" size={20} />
                <input 
                  type="text" 
                  placeholder="Find grounds in Kanpur..."
                  className="w-full bg-[#111] border border-white/5 rounded-3xl py-6 pl-14 pr-6 outline-none focus:border-[#FFC107]/20 transition-all font-bold text-sm tracking-wide"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Filter Chips */}
              <div className="flex space-x-3 overflow-x-auto no-scrollbar py-2">
                {['All', 'Turf', 'Grass', 'Matting'].map(f => (
                  <button 
                    key={f} 
                    onClick={() => setActiveFilter(f)}
                    className={`whitespace-nowrap px-6 py-3 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeFilter === f ? 'bg-[#FFC107] text-black border-[#FFC107] shadow-lg shadow-[#FFC107]/20' : 'bg-white/5 border-white/10 text-white/30'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Venue Feed */}
            <div className="space-y-10">
              {filteredVenues.map((venue, idx) => (
                <motion.div
                  key={venue.id}
                  layoutId={venue.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  onClick={() => setSelectedVenue(venue)}
                  className="group cursor-pointer relative rounded-[40px] overflow-hidden bg-[#0D0D0D] border border-white/5"
                >
                  <div className="aspect-[16/11] relative overflow-hidden">
                    <img 
                      src={venue.image} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                      alt={venue.name} 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    
                    {/* Badge Overlay */}
                    <div className="absolute top-6 left-6 flex space-x-2">
                      <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 flex items-center space-x-2">
                        <Star size={12} className="text-[#FFC107] fill-[#FFC107]" />
                        <span className="text-[10px] font-black text-white">{venue.rating}</span>
                      </div>
                      <div className="bg-[#FFC107] px-4 py-2 rounded-full text-black text-[10px] font-black uppercase tracking-widest shadow-xl">
                        Starting â¹{venue.priceStart}
                      </div>
                    </div>
                  </div>

                  <div className="p-8 space-y-4">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <h3 className="font-heading text-3xl tracking-tight text-white uppercase">{venue.name}</h3>
                        <div className="flex items-center text-white/30 text-[10px] font-black uppercase tracking-widest">
                          <MapPin size={12} className="mr-1.5" /> {venue.distance} â¢ {venue.pitchType}
                        </div>
                      </div>
                      <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-[#FFC107] group-hover:text-black transition-colors">
                        <ArrowRight size={20} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <DetailView 
            venue={selectedVenue} 
            onBack={() => setSelectedVenue(null)} 
            onBook={() => setShowBooking(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBooking && (
          <BookingModal onClose={() => setShowBooking(false)} venue={selectedVenue!} />
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailView: React.FC<{ venue: Venue, onBack: () => void, onBook: () => void }> = ({ venue, onBack, onBook }) => {
  const [selectedPriceIdx, setSelectedPriceIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 150]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative bg-black min-h-screen">
      {/* Parallax Hero Image */}
      <div className="relative h-[55vh] overflow-hidden">
        <motion.img 
          layoutId={venue.id} 
          src={venue.image} 
          style={{ y }}
          className="w-full h-full object-cover" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
        
        <button 
          onClick={onBack} 
          className="absolute top-10 left-6 p-4 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 text-white z-50 hover:bg-black/60 transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
      </div>

      <div className="px-6 -mt-16 relative z-10 space-y-12 pb-64">
        {/* Title and Rating */}
        <div className="space-y-4">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex justify-between items-start">
            <div className="space-y-2">
              <h2 className="font-heading text-5xl tracking-tighter uppercase leading-none">{venue.name}</h2>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">{venue.location}</p>
            </div>
            <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 p-4 rounded-3xl text-center min-w-[80px]">
              <p className="font-numbers text-2xl font-bold text-[#FFC107]">{venue.rating}</p>
              <p className="text-[8px] font-black text-[#FFC107]/60 uppercase">{venue.reviewCount} Reviews</p>
            </div>
          </motion.div>

          {/* Managed By Profile */}
          <div className="flex items-center p-6 bg-white/[0.03] border border-white/5 rounded-[32px] space-x-4">
            <div className="w-14 h-14 rounded-full border border-[#FFC107]/40 p-1">
              <img src={venue.owner.avatar} className="w-full h-full rounded-full bg-black" />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h4 className="font-bold text-white text-sm">{venue.owner.name}</h4>
                {venue.owner.verified && <ShieldCheck size={14} className="text-[#FFC107]" />}
              </div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest">{venue.owner.role}</p>
            </div>
            <button className="p-3 bg-white/5 rounded-full text-white/40 hover:text-[#FFC107] transition-colors">
              <MessageSquare size={18} />
            </button>
          </div>
        </div>

        {/* Pricing Tiers (Horizontal Scroll) */}
        <div className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/30 ml-1">PRICING PACKAGES</h3>
          <div className="flex space-x-4 overflow-x-auto no-scrollbar pb-2">
            {venue.pricing.map((tier, idx) => (
              <button 
                key={idx} 
                onClick={() => setSelectedPriceIdx(idx)}
                className={`flex-shrink-0 w-44 p-6 rounded-[32px] border-2 transition-all flex flex-col items-center text-center space-y-2 ${
                  selectedPriceIdx === idx 
                  ? 'border-[#FFC107] bg-[#FFC107]/5 shadow-lg shadow-[#FFC107]/10' 
                  : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                <p className="text-[9px] font-bold text-white/40 uppercase">{tier.label}</p>
                <p className="font-numbers text-4xl text-white font-bold leading-none">â¹{tier.price}</p>
                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">{tier.format}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Amenities Grid */}
        <div className="space-y-6">
          <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/30 ml-1">STADIUM AMENITIES</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {venue.amenities.map((item, idx) => (
              <div key={idx} className="flex items-center p-5 bg-white/[0.02] border border-white/5 rounded-3xl space-x-4">
                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[#FFC107]">
                  <item.icon size={20} />
                </div>
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dugout Whisper (Reviews & Gallery) */}
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/30 ml-1">DUGOUT WHISPER</h3>
            <button className="text-[10px] font-black text-[#FFC107] uppercase tracking-widest flex items-center">
              SEE ALL <ChevronRight size={14} className="ml-1" />
            </button>
          </div>

          {/* Guest Gallery */}
          <div className="flex space-x-4 overflow-x-auto no-scrollbar pb-2">
            <div className="flex-shrink-0 w-32 h-44 rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center space-y-2 text-white/20 hover:text-white/40 transition-colors cursor-pointer">
              <Camera size={24} />
              <span className="text-[8px] font-black uppercase tracking-widest text-center">Add<br/>Photo</span>
            </div>
            {venue.guestPhotos.map((img, i) => (
              <motion.img 
                key={i} 
                whileHover={{ scale: 1.05 }}
                src={img} 
                className="flex-shrink-0 w-32 h-44 object-cover rounded-3xl border border-white/10 shadow-xl" 
              />
            ))}
          </div>

          {/* Review List */}
          <div className="space-y-4">
            {venue.reviews.map((rev, i) => (
              <div key={i} className="p-6 bg-white/[0.02] border border-white/5 rounded-[32px] space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h5 className="font-bold text-sm text-white">{rev.user}</h5>
                    <p className="text-[9px] text-white/20 font-black uppercase tracking-widest">{rev.date}</p>
                  </div>
                  <div className="flex space-x-0.5">
                    {[...Array(5)].map((_, star) => (
                      <Star key={star} size={10} className={star < rev.rating ? 'text-[#FFC107] fill-[#FFC107]' : 'text-white/10'} />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-white/60 leading-relaxed italic">"{rev.comment}"</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Booking Action Footer - Fixed Collision with Nav */}
      <div className="fixed bottom-28 left-6 right-6 p-6 bg-black/90 backdrop-blur-3xl border border-white/10 rounded-[40px] flex items-center justify-between z-[80] shadow-[0_-20px_80px_rgba(0,0,0,0.8)]">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Authorization Amount</p>
          <div className="flex items-baseline space-x-2">
            <span className="font-numbers text-4xl text-[#FFC107] font-bold">â¹{venue.pricing[selectedPriceIdx].price}</span>
            <span className="text-[10px] font-bold text-white/20">/ Slot</span>
          </div>
        </div>
        <MotionButton 
          onClick={onBook}
          className="bg-gradient-to-r from-[#FFC107] to-[#FDB931] text-black !px-10 !py-5 font-black tracking-widest !rounded-[24px] shadow-2xl shadow-[#FFC107]/20"
        >
          BOOK NOW
        </MotionButton>
      </div>
    </motion.div>
  );
};

const BookingModal: React.FC<{ onClose: () => void, venue: Venue }> = ({ onClose, venue }) => {
  const [step, setStep] = useState<'SLOT' | 'CONFIRM' | 'SUCCESS'>('SLOT');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const SLOTS = ['07:00 AM', '10:00 AM', '04:00 PM', '07:00 PM', '10:00 PM'];

  const handleConfirm = () => {
    setStep('SUCCESS');
    setTimeout(onClose, 2500);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 40 }} 
        animate={{ scale: 1, y: 0 }} 
        className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-[56px] overflow-hidden flex flex-col shadow-[0_0_120px_rgba(0,0,0,1)]"
      >
        <div className="p-8 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
           <h3 className="font-heading text-4xl tracking-tighter uppercase italic">CALENDAR SYNC</h3>
           <button onClick={onClose} className="p-3 bg-white/5 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-10 space-y-10">
          {step === 'SLOT' && (
            <>
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 text-center">SELECT TACTICAL SLOT</p>
                <div className="grid grid-cols-2 gap-3">
                  {SLOTS.map(slot => (
                    <button 
                      key={slot} 
                      onClick={() => setSelectedSlot(slot)}
                      className={`py-4 rounded-2xl border transition-all font-numbers text-lg font-bold ${
                        selectedSlot === slot ? 'bg-[#FFC107] text-black border-[#FFC107] shadow-lg shadow-[#FFC107]/20' : 'bg-white/5 border-white/5 text-white/40'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
              <MotionButton 
                disabled={!selectedSlot}
                onClick={() => setStep('CONFIRM')} 
                className="w-full bg-white text-black font-black py-5 !rounded-3xl tracking-widest"
              >
                PROCEED
              </MotionButton>
            </>
          )}

          {step === 'CONFIRM' && (
            <div className="space-y-8">
              <div className="space-y-2 text-center">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Battle Summary</p>
                <h4 className="font-heading text-3xl uppercase leading-none">{venue.name}</h4>
                <div className="flex items-center justify-center space-x-3 text-[#FFC107]">
                  <Clock size={16} />
                  <span className="font-numbers text-xl font-bold tracking-tight">{selectedSlot}</span>
                </div>
              </div>
              <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                <div className="flex justify-between items-center">
                   <p className="text-[11px] font-bold text-white/40 uppercase">Authorization Total</p>
                   <p className="font-numbers text-3xl text-[#FFC107] font-bold">â¹{venue.pricing[0].price}</p>
                </div>
              </div>
              <div className="flex space-x-4">
                 <button onClick={() => setStep('SLOT')} className="flex-1 py-5 text-white/30 font-black uppercase text-[10px] tracking-widest">BACK</button>
                 <MotionButton onClick={handleConfirm} className="flex-[2] bg-[#FFC107] text-black font-black py-5 !rounded-3xl tracking-widest shadow-xl shadow-[#FFC107]/20">AUTHORIZE</MotionButton>
              </div>
            </div>
          )}

          {step === 'SUCCESS' && (
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="py-12 space-y-6 text-center">
               <div className="w-24 h-24 bg-[#39FF14]/10 rounded-full border border-[#39FF14]/30 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={48} className="text-[#39FF14]" />
               </div>
               <div className="space-y-2">
                 <h3 className="font-heading text-4xl uppercase tracking-tighter italic">BATTLE CONFIRMED</h3>
                 <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Check your Digital Archive</p>
               </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Arena;
