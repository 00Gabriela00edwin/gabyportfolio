import { Cpu, Briefcase } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AboutObservatory() {
  return (
    <section id="about" className="py-28 px-6 max-w-6xl mx-auto relative">
      {/* Fondo decorativo sutil */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-space-800/40 to-transparent pointer-events-none"></div>
      
      {/* Encabezado de la sección */}
      <div className="text-center mb-16 relative z-10">
        <span className="text-neon-cyan text-xs font-mono tracking-widest uppercase bg-neon-cyan/10 px-4 py-1.5 rounded-full border border-neon-cyan/30">
          El Observatorio & Taller
        </span>
        <h2 className="text-3xl md:text-5xl font-extrabold mt-4 text-slate-100 tracking-tight">
          Donde la Astronomía se encuentra con el <span className="bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink bg-clip-text text-transparent">Desarrollo Frontend</span>
        </h2>
        <p className="text-slate-400 mt-4 max-w-2xl mx-auto text-sm md:text-base font-light">
          La precisión que requiere observar el cielo con un telescopio es la misma atención al detalle que aplico en cada componente de React y cada píxel de diseño.
        </p>
      </div>

      {/* Grilla de dos mundos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
        
        {/* Tarjeta 1: Arte, Multimedia y React */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-space-800/50 border border-slate-800 hover:border-neon-cyan/50 p-8 rounded-3xl backdrop-blur-md transition-all shadow-xl flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan mb-6">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-slate-100">Licenciatura & Frontend React</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-6">
              Especializada en React.js, Tailwind CSS y animaciones avanzadas. Como Licenciada en Arte Digital y Multimedia, no solo escribo código limpio y escalable, sino que diseño interfaces vivas con una sensibilidad visual única en el mercado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['React.js', 'Tailwind CSS', 'UI/UX Design', 'Framer Motion', 'JavaScript ES6+'].map((tech, i) => (
              <span key={i} className="text-xs bg-space-700/80 text-neon-cyan px-3 py-1.5 rounded-lg border border-neon-cyan/20 font-mono">
                {tech}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Tarjeta 2: Gestión Cultural & Taller de Arte (Parque del Conocimiento) */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-space-800/50 border border-slate-800 hover:border-neon-pink/50 p-8 rounded-3xl backdrop-blur-md transition-all shadow-xl flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-neon-pink/10 border border-neon-pink/30 flex items-center justify-center text-neon-pink mb-6">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-slate-100">Gestión & Artes del Fuego</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-6">
              Mi rol en la coordinación administrativa y gestión de proyectos en el Parque del Conocimiento me otorga una visión integral. Domino la organización de procesos, tableros de control y la capacidad de llevar proyectos tecnológicos y creativos de punta a punta.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Gestión Administrativa', 'Control de Stock', 'Liderazgo de Proyectos', 'Retool & Firebase'].map((skill, i) => (
              <span key={i} className="text-xs bg-space-700/80 text-neon-pink px-3 py-1.5 rounded-lg border border-neon-pink/20 font-mono">
                {skill}
              </span>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}