import { motion, useScroll, useTransform } from 'framer-motion';
import { Sparkles, Palette, Moon } from 'lucide-react';

export default function Hero() {
  const { scrollYProgress } = useScroll();
  
  const butterflyScale = useTransform(scrollYProgress, [0, 0.3], [1, 1.25]);
  const codeMatrixOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);
  const organicWingOpacity = useTransform(scrollYProgress, [0.15, 0.35], [0, 1]);

  return (
    <section id="hero" className="min-h-[140vh] relative flex flex-col items-center pt-32 px-6 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-space-700 via-space-900 to-space-900 z-0 opacity-90"></div>
      
      <div className="absolute top-20 left-10 text-neon-cyan/20 animate-pulse duration-1000 hidden md:block">
        <Moon className="w-16 h-16" />
      </div>
      <div className="absolute top-40 right-12 text-neon-pink/20 animate-bounce duration-700 hidden md:block">
        <Sparkles className="w-12 h-12" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center flex flex-col items-center">
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs md:text-sm mb-6 backdrop-blur-md shadow-xl shadow-neon-cyan/10"
        >
          <Palette className="w-4 h-4 text-neon-cyan" />
          <span>Licenciada en Arte Digital & UI/UX Expert</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-5xl md:text-8xl font-black tracking-tighter mb-6 leading-none"
        >
          METAMORFOSIS <br />
          <span className="bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink bg-clip-text text-transparent font-light italic">
            DIGITAL & CÓSMICA
          </span>
        </motion.h1>

        <div className="relative w-80 h-80 md:w-96 md:h-96 my-10 flex items-center justify-center">
          <div className="absolute inset-0 border border-neon-cyan/20 rounded-full animate-spin duration-[12s]"></div>
          <div className="absolute inset-6 border border-dashed border-neon-purple/30 rounded-full animate-spin duration-[20s] reverse"></div>

          <motion.div 
            style={{ opacity: codeMatrixOpacity, scale: butterflyScale }}
            className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-space-800/60 backdrop-blur-2xl border border-neon-cyan/40 rounded-3xl shadow-2xl shadow-neon-cyan/20 text-left font-mono"
          >
            <div className="text-[11px] text-neon-cyan/80 leading-relaxed overflow-hidden w-full">
              <p className="text-neon-pink">&lt;DigitalButterflyMatrix&gt;</p>
              <p className="pl-3">const art = "Licenciatura";</p>
              <p className="pl-3">const code = "React.js";</p>
              <p className="pl-3">render(cosmos, ui_interfaces);</p>
              <p className="text-neon-pink">&lt;/DigitalButterflyMatrix&gt;</p>
            </div>
            <div className="mt-6 text-center w-full">
              <span className="text-xs tracking-widest text-neon-cyan font-bold uppercase bg-neon-cyan/10 px-3 py-1.5 rounded-full border border-neon-cyan/30">
                [ Fase 1: Algoritmo Puro ]
              </span>
            </div>
          </motion.div>

          <motion.div 
            style={{ opacity: organicWingOpacity, scale: butterflyScale }}
            className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-neon-purple/30 via-space-800/90 to-neon-pink/30 backdrop-blur-2xl border border-neon-pink/60 rounded-3xl shadow-2xl shadow-neon-pink/40 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-neon-cyan to-neon-pink flex items-center justify-center mb-3 shadow-lg shadow-neon-pink/60 animate-pulse">
              <Sparkles className="w-8 h-8 text-space-900" />
            </div>
            <h3 className="text-xl font-bold text-slate-100 tracking-wider">Arte, Naturaleza & UI</h3>
            <p className="text-xs text-slate-300 mt-2 px-4 leading-relaxed">
              La rigidez del código se abre para dar paso a la sensibilidad visual y la fluidez humana.
            </p>
            <span className="mt-4 text-[10px] text-neon-pink font-mono tracking-widest uppercase bg-neon-pink/10 px-3 py-1.5 rounded-full border border-neon-pink/30">
              [ Fase 2: Metamorfosis Viva ]
            </span>
          </motion.div>
        </div>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-slate-300 text-lg md:text-xl max-w-2xl mb-10 font-light tracking-wide"
        >
          Desplaza hacia abajo para ver la transición. Fusionando la astronomía, la pasión por las mariposas y el desarrollo frontend avanzado en React.
        </motion.p>

        <div className="flex flex-col sm:flex-row gap-5 w-full justify-center">
          <a 
            href="#projects" 
            className="bg-gradient-to-r from-neon-cyan to-neon-purple text-space-900 font-bold px-8 py-4 rounded-full hover:opacity-90 transition-all shadow-xl shadow-neon-cyan/20 tracking-wide text-sm"
          >
            Explorar Paneles & Trabajos
          </a>
          <a 
            href="#contact" 
            className="border border-slate-700 hover:border-neon-cyan text-slate-200 px-8 py-4 rounded-full transition-all bg-space-800/40 backdrop-blur-md text-sm"
          >
            Iniciar Conversación
          </a>
        </div>

      </div>
    </section>
  );
}